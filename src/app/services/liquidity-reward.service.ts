import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { U128 } from './util.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { Subject } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class LiquidityRewardService implements OnDestroy {
  private raiAccounts: {[account:string]: RaiAccountInfo} = {};
  private bscAccounts: {[account:string]: BscAccountInfo} = {};
  private lpItems: LpItem[] = [];
  private nextSyncLpItemsAt: number = 0;

  private recipientSubject = new Subject<{error: boolean; info?:string}>();
  public recipientOpResult$ = this.recipientSubject.asObservable();

  private SERVICE = 'pancakeswap_liquidity_reward';
  private timer: any = null;

  constructor(
    private server: ServerService
  ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timer = setInterval(() => this.ongoingSync(), 1000);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  addAccount(account: string) {
    account = account.toLowerCase();
    if (account.startsWith('rai_')) {
      if (this.raiAccounts[account]) return;
      this.raiAccounts[account] = new RaiAccountInfo();
    } else if (account.startsWith('0x')) {
      if (this.bscAccounts[account]) return;
      this.bscAccounts[account] = new BscAccountInfo();
    }
  }

  delAccount(account: string) {
    account = account.toLowerCase();
    if (account.startsWith('rai_')) {
      if (!this.raiAccounts[account]) return;
      delete this.raiAccounts[account];
      this.nextSyncLpItemsAt = 0;
    } else if (account.startsWith('0x')) {
      if (!this.bscAccounts[account]) return;
      delete this.bscAccounts[account];
      this.nextSyncLpItemsAt = 0;
    }
  }

  clear() {
    this.raiAccounts = {};
    this.bscAccounts = {};
    this.lpItems = [];
  }

  getRecipient(account: string): string {
    account = account.toLowerCase();
    if (!this.bscAccounts[account]) return '';
    return this.bscAccounts[account].recipient;
  }

 
  setRecipient(account: string, recipient: string, timestamp:string, signature:string): string {
    account = account.toLowerCase();
    if (!this.bscAccounts[account] || !this.bscAccounts[account].synced) {
      return 'The account is synchronizing, please try later';
    }

    if (!this.isLp(account)) {
      return 'the BSC account has not added any liquidity yet';
    }
    
    this.sendRecipient(account, recipient, timestamp, signature);

    return '';
  }

  getLpItems(): LpItem[] {
    return this.lpItems;
  }

  empty(): boolean {
    if (this.lpItems.length > 0) return false;

    for (let i in this.bscAccounts) {
      if (!this.bscAccounts[i].synced) return false;
    }

    for (let i in this.raiAccounts) {
      if (!this.raiAccounts[i].synced) return false;
    }

    return true;
  }

  private isLp(account: string): boolean {
    for (let i of this.lpItems) {
      if (i.account === account) return true;
    }
    return false;
  }

  private processServerState(state: ServerState) {
    if (state === ServerState.CONNECTED) {
      this.ongoingSync(true);
    }
    else {
    }
  }

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;
    const now = window.performance.now();

    for (let account in this.raiAccounts) {
      let info = this.raiAccounts[account];
      if (info.nextSyncAt > now && !force) continue;
      if (!info.synced) {
        this.syncLpItems(account);
      }

      this.subscribe(account);

      if (info.synced && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } 
      else {
        info.nextSyncAt = now + 1500;
      }
    }

    for (let account in this.bscAccounts) {
      let info = this.bscAccounts[account];
      if (info.nextSyncAt > now && !force) continue;
      if (!info.synced) {
        this.syncLpItems(account);
      }

      this.subscribe(account);
      this.syncRecipient(account);

      if (info.synced && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } 
      else {
        info.nextSyncAt = now + 1500;
      }
    }

    if (this.nextSyncLpItemsAt <= now || force) {
      this.syncLpItems();
      this.nextSyncLpItemsAt = now + 150000 + Math.random() * 300 * 1000;
    }
  }

  private sendRecipient(
    account: string,
    recipient: string,
    timestamp: string,
    signature: string
  ) {
    const message: any = {
      action: 'set_recipient',
      service: this.SERVICE,
      account: account,
      recipient: recipient,
      timestamp: timestamp,
      signature: signature,
      request_id: account
    };
    this.server.send(message);
  }

  private subscribe(account: string) {
    let filterKey = '';
    if (account.startsWith('rai_')) {
      filterKey = 'rai_account';
    } else if (account.startsWith('0x')) {
      filterKey = 'bsc_account';
    } else {
      return;
    }

    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{key:filterKey, value:account}],
      request_id: account
    };
    this.server.send(message);
  }

  private syncRecipient(account: string) {
    const message: any = {
      action: 'get_recipient',
      service: this.SERVICE,
      account: account,
      request_id: account
    };
    this.server.send(message);
  }

  private syncLpItems(account?:string) {
    let accounts = [];
    if (account) {
      accounts.push(account);
    } else {
      for (let account in this.raiAccounts) {
        accounts.push(account);
      }
      for (let account in this.bscAccounts) {
        accounts.push(account);
      }
    }

    if (accounts.length === 0) {
      this.clear();
      return;
    }

    const message: any = {
      action: 'lp_items',
      service: this.SERVICE,
      accounts: accounts,
    };
    if (account) {
      message.request_id = account;
    }
    this.server.send(message);
  }

  private processMessage(message: any) {
    if (!message.service || message.service !== this.SERVICE) return;

    if (message.ack) {
      switch (message.ack) {
        case 'service_subscribe':
          this.processServiceSubscribe(message);
          break;
        case 'lp_items':
          this.processLpItems(message);
          break;
        case 'get_recipient':
          this.processRecipientGet(message);
          break;
        case 'set_recipient':
          this.processRecipientSet(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'recipient_info':
          this.processRecipientInfoNotify(message);
          break;
        case 'lp_item':
          this.processLpItem(message);
          break;
        default:
          break;
        }
    }
  }

  private processServiceSubscribe(message: any) {
    if (!message.request_id) {
      console.log('processServiceSubscribeAck: request_id missing');
      return;
    }

    const id = message.request_id;
    if (id.startsWith('rai_')) {
      const account = id;
      const info = this.raiAccounts[account];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    } else if (id.startsWith('0x')) {
      const account = id.toLowerCase();
      const info = this.bscAccounts[account];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    }
  }

  private processLpItem(message: any) {
    const item = new LpItem();
    const error = item.fromJson(message);
    if (error) return;
    this.addLpItem(item);
  }

  private processLpItems(message: any) {
    const account = message.request_id;
    if (!message.items) return;

    const items: LpItem[] = [];
    for (let i of message.items) {
      const item = new LpItem();
      const error = item.fromJson(i);
      if (error) {
        console.log('processLpItems: failed to parse from json=', i);
        continue;
      }

      if (item.share.eq(0)) continue;
      items.push(item);
    }

    if (account) {
      if (account.startsWith('rai_')) {
        if (this.raiAccounts[account]) {
          this.raiAccounts[account].synced = true;
        }
      } else if (account.startsWith('0x')) {
        if (this.bscAccounts[account]) {
          this.bscAccounts[account].synced = true;
        }
      }

      for (let i of items) {
        this.addLpItem(i);
      }

    } else {
      this.lpItems = items;
    }
  }

  private addLpItem(item: LpItem) {
    const index = this.lpItems.findIndex(x => item.eq(x));
    if (index >= 0) {
      if (item.share.eq(0)) {
        this.lpItems.splice(index, 1);
      } else {
        this.lpItems[index] = item;
      }
    } else {
      if (!item.share.eq(0)) {
        this.lpItems.push(item);
      }
    }
    this.lpItems.sort((a, b) => b.created_at - a.created_at);
  }

  private processRecipientGet(message: any) {
    const account = message.request_id;
    if (!account) return;
    if (!this.bscAccounts[account]) return;
    if (message.recipient) {
      this.bscAccounts[account].recipient = message.recipient;
    } else {
      this.bscAccounts[account].recipient = 'not set';
    }
  }

  private processRecipientSet(message: any) {
    const account = message.request_id;
    if (!account) return;
    if (!this.bscAccounts[account]) return;
    if (message.error) {
      this.recipientSubject.next({error:true, info:message.error});
    } else {
      this.recipientSubject.next({error:false});
    }
  }
  private processRecipientInfoNotify(message: any) {
    const account = message.account;
    const recipient = message.recipient;
    if (!account || !recipient || !this.bscAccounts[account]) return;
    this.bscAccounts[account].recipient = recipient;
  }

} // end of LiquidityRewardService

class RaiAccountInfo {
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
}

class BscAccountInfo {
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
  recipient: string = 'querying...';
}

export class LpItem {
  pair: string = '';
  account: string = '';
  share: U128 = new U128(0);
  reward: U128 = new U128(0);
  recipient: string = '';
  created_at: number = 0;

  fromJson(json: any): boolean {
    try {
      this.pair = json.pair;
      this.account = json.account.toLowerCase();
      this.share = new U128(json.share);
      this.reward = new U128(json.reward_amount);
      this.recipient = json.recipient;
      this.created_at = +json.created_at;     
      return false
    }
    catch (e) {
      console.log(`LpItem.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  eq(other: LpItem): boolean {
    return this.account === other.account && this.pair === other.pair;
  }
}

marker('The account is synchronizing, please try later');
marker('the BSC account has not added any liquidity yet');
marker('rate limited, please try later');
marker('signature is outdated');
marker('invalid timestamp');
marker('invalid recipient');
marker('invalid signature');