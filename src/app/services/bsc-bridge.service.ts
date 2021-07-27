import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { UtilService, U128, U256, U8, Extension } from './util.service';
import { Block, BlocksService } from './blocks.service';

@Injectable({
  providedIn: 'root'
})
export class BscBridgeService implements OnDestroy {

  private mints: {[account: string]: BscMintAccountInfo} = {};
  private redeems: {[account: string]: BscRedeemAccountInfo} = {};
  private timer: any = null;

  constructor(
    private util: UtilService,
    private blocks: BlocksService,
    private server: ServerService) {

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

  public addAccount(account: string) {
    account = account.toLowerCase();
    if (account.startsWith('rai')) {
      if (this.mints[account]) return;
      this.mints[account] = new BscMintAccountInfo();

    } else if (account.startsWith('0x')) {
      if (this.redeems[account]) return;
      this.redeems[account] = new BscRedeemAccountInfo();
    }
  }

  public addMintBlock(block: Block) {
    const account = block.account().toAccountAddress();
    this.addAccount(account);
    const amount = this.blocks.getBlockAmount(block.hash());
    const item = new BscMintItem();
    item.fromBlock(block, amount?.value);
    this.addMintItem(account, item);
  }

  public mintItem(account:string, txn: string): BscMintItem | undefined {
    if (!this.mints[account]) return;

    return this.mints[account].items.find(x => x.source_txn.toHex().toLowerCase() == txn);
  }

  public mintItems(account: string): BscMintItem[] {
    account = account.toLowerCase();
    if (!this.mints[account]) return [];
    return this.mints[account].items;
  }

  public redeemItems(account: string): BscRedeemItem[] {
    account = account.toLowerCase();
    if (!this.redeems[account]) return [];
    return this.redeems[account].items;
  }

  public mintItemsEmpty(account: string): boolean {
    if (!this.mints[account]) {
      return false;
    }
    if (!this.mints[account].subscribed || !this.mints[account].synced) {
      return false;
    }

    return this.mints[account].items.length === 0;
  }

  public redeemItemsEmpty(account: string): boolean {
    account = account.toLowerCase();
    if (!this.redeems[account]) {
      return false;
    }
    if (!this.redeems[account].subscribed || !this.redeems[account].synced) {
      return false;
    }

    return this.redeems[account].items.length === 0;
  }

  public mintItemsAll(account: string) {
    if (!this.mints[account]) {
      return true;
    }
    if (!this.mints[account].subscribed || !this.mints[account].synced) {
      return true;
    }

    return this.mints[account].all;
  }

  public redeemItemsAll(account: string): boolean {
    account = account.toLowerCase();
    if (!this.redeems[account]) {
      return true;
    }
    if (!this.redeems[account].subscribed || !this.redeems[account].synced) {
      return true;
    }

    return this.redeems[account].all;
  }

  public increaseMintItemSize(account: string, num: number) {
    if (!this.mints[account]) return;
    this.mints[account].itemSize += num;
    this.mints[account].nextSyncAt = 0;
  }

  public increaseRedeemItemSize(account: string, num: number) {
    account = account.toLowerCase();
    if (!this.redeems[account]) return;
    this.redeems[account].itemSize += num;
    this.redeems[account].nextSyncAt = 0;
  }

  public bscAccountBalance(account: string): U128 | undefined {
    account = account.toLowerCase();
    if (!this.redeems[account]) return;
    return this.redeems[account].balance;
  }

  public updateBscAccountBalance(account: string) {
    if (!account) return;
    account = account.toLowerCase();
    if (!this.redeems[account]) return;
    this.redeems[account].balanceFastSyncCount += 3;
  }

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;

    this.forEachMintAccount((account, info) => {
      let now = window.performance.now();
      if (info.nextSyncAt > now && !force) return;

      this.syncMintAccount(account, info);

      if (info.synced && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } 
      else {
        info.nextSyncAt = now + 1500;
      }
    });

    this.forEachRedeemAccount((account, info) => {
      let now = window.performance.now();
      if (info.nextSyncAt > now && !force) return;

      this.syncRedeemAccount(account, info);

      if (info.synced && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } 
      else {
        info.nextSyncAt = now + 1500;
      }
    });

    this.forEachRedeemAccount((account, info) => {
      let now = window.performance.now();
      if (info.balanceNextSyncAt > now && !force) return;

      this.syncBscAccountBalance(account);

      if (info.balanceFastSyncCount > 0) {
        info.balanceNextSyncAt = now + 3000;
        info.balanceFastSyncCount -= 1;
      } 
      else {
        info.balanceNextSyncAt = now + 45000 + Math.random() * 30 * 1000;
      }
    });
  }

  private syncMintAccount(account: string, info: BscMintAccountInfo) {
    this.mintAccountSubscribe(account);
    if (!info.subscribed) return;

    this.syncMintItems(account, info);
  }

  private syncRedeemAccount(account: string, info: BscRedeemAccountInfo) {
    this.redeemAccountSubscribe(account);
    if (!info.subscribed) return;

    this.syncRedeemItems(account, info);
  }


  private syncBscAccountBalance(account: string) {
    const message: any = {
      action: 'bsc_account_balance',
      service: 'bsc_bridge',
      account: account,
      request_id: account
    };
    this.server.send(message);
  }

  private mintAccountSubscribe(account: string) {
    const message: any = {
      action: 'service_subscribe',
      service: 'bsc_bridge',
      filters: [{key:'rai_account', value:account}],
      request_id: `mint:${account}`
    };
    this.server.send(message);
  }

  private redeemAccountSubscribe(account: string) {
    const message: any = {
      action: 'service_subscribe',
      service: 'bsc_bridge',
      filters: [{key:'bsc_account', value:account}],
      request_id: `redeem:${account}`
    };
    this.server.send(message);
  }

  private syncMintItems(account: string, info: BscMintAccountInfo) {
    const message: any = {
      action: 'mint_items',
      service: 'bsc_bridge',
      count: info.itemSize,
      account: account,
      request_id: account
    };
    this.server.send(message);
  }

  private syncRedeemItems(account: string, info: BscRedeemAccountInfo) {
    const message: any = {
      action: 'redeem_items',
      service: 'bsc_bridge',
      count: info.itemSize,
      account: account,
      request_id: account
    };
    this.server.send(message);
  }

  private processServerState(state: ServerState) {
    if (state === ServerState.CONNECTED) {
      this.ongoingSync(true);
    }
    else {
    }
  }

  private processMessage(message: any) {
    if (!message.service || message.service !== 'bsc_bridge') return;

    if (message.ack) {
      switch (message.ack) {
        case 'service_subscribe':
          this.processServiceSubscribeAck(message);
          break;
        case 'mint_items':
          this.processMintItems(message);
          break;
        case 'redeem_items':
          this.processRedeemItems(message);
          break;
        case 'bsc_account_balance':
          this.processBscAccountBalance(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'mint_info':
          this.processMintInfoNotify(message);
          break;
        case 'redeem_info':
          this.processRedeemInfoNotify(message);
          break;
        default:
          break;
        }
    }
  }

  private processMintItems(message: any) {
    const account = message.request_id;
    if (!this.mints[account]) return;

    const items: BscMintItem[] = [];
    if (!message.items) {
      this.mints[account].items = items;
      this.mints[account].synced = true;
      return;
    }
    
    for (let i of message.items) {
      const item = new BscMintItem();
      const error = item.fromJson(i);
      if (error) {
        console.log('processMintItems: failed to parse from json:', i);
        continue;
      }
      items.push(item);
    }
    this.mints[account].items = items;
    this.mints[account].synced = true;
    this.mints[account].all = message.all === 'true';
  }

  private processRedeemItems(message: any) {
    const account = message.request_id;
    if (!this.redeems[account]) return;

    const items: BscRedeemItem[] = [];
    if (!message.items) {
      this.redeems[account].items = items;
      this.redeems[account].synced = true;
      return;
    }
    
    for (let i of message.items) {
      const item = new BscRedeemItem();
      const error = item.fromJson(i);
      if (error) {
        console.log('processRedeemItems: failed to parse from json=', i);
        continue;
      }
      items.push(item);
    }
    this.redeems[account].items = items;
    this.redeems[account].synced = true;
    this.redeems[account].all = message.all === 'true';
  }

  private processServiceSubscribeAck(message: any) {
    if (!message.request_id) {
      console.log('processServiceSubscribeAck: request_id missing');
      return;
    }

    const id = message.request_id;
    if (id.startsWith('mint:')) {
      const account = id.substr(5).toLocaleLowerCase();
      const info = this.mints[account];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    } else if (id.startsWith('redeem:')) {
      const account = id.substr(7).toLocaleLowerCase();
      const info = this.redeems[account];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    }
  }

  private processBscAccountBalance(message: any) {
    const account = message.request_id;
    if (!this.redeems[account]) return;

    this.redeems[account].balance = new U128(message.balance);
  }

  private processMintInfoNotify(message: any) {
    const account = message.from.toLowerCase();
    if (!this.mints[account]) return;

    const item = new BscMintItem();
    const error = item.fromJson(message);
    if (error) {
      console.log('processMintInfoNotify: failed to parse from json=', message);
      return;
    }

    this.addMintItem(account, item);
  }

  private processRedeemInfoNotify(message: any) {
    const account = message.from.toLowerCase();
    if (!this.redeems[account]) return;

    const item = new BscRedeemItem();
    const error = item.fromJson(message);
    if (error) {
      console.log('processRedeemInfoNotify: failed to parse from json=', message);
      return;
    }

    let index = this.redeems[account].items.findIndex(i => i.source_txn.eq(item.source_txn));
    if (index >= 0) {
      this.redeems[account].items[index] = item;
      return;
    }

    index = this.redeems[account].items.findIndex(i => i.timestamp <= item.timestamp);
    if (index >= 0) {
      this.redeems[account].items.splice(index, 0, item);
      return;
    }

    this.redeems[account].items.push(item);
  }

  private addMintItem(account: string, item: BscMintItem) {
    let index = this.mints[account].items.findIndex(i => i.source_txn.eq(item.source_txn));
    if (index >= 0) {
      this.mints[account].items[index] = item;
      return;
    }

    index = this.mints[account].items.findIndex(i => i.timestamp <= item.timestamp);
    if (index >= 0) {
      this.mints[account].items.splice(index, 0, item);
      return;
    }

    this.mints[account].items.push(item);
  }

  private forEachMintAccount(callback: (account: string, info: BscMintAccountInfo) => void) {
    for (let k in this.mints) {
      callback(k, this.mints[k]);
    }
  }

  private forEachRedeemAccount(callback: (account: string, info: BscRedeemAccountInfo) => void) {
    for (let k in this.redeems) {
      callback(k, this.redeems[k]);
    }
  }

}

export class BscMintItem {
  from: string = '';
  to: string = '';
  state: string = '';
  amount: U128 = new U128(0);
  timestamp: number = 0;
  source_txn: U256 = new U256(0);
  dest_txn: U256 = new U256(0);
  r: U256 = new U256(0);
  s: U256 = new U256(0);
  v: U8 = new U8(0);

  fromJson(json: any): boolean {
    try {
      this.from = json.from;
      this.to = json.to;
      this.state = json.state;
      this.amount = new U128(json.amount);
      this.timestamp = +json.timestamp;
      if (!json.source_txn) {
        console.log(`Invalid mint_item(${json})`);
      }
      this.source_txn = new U256(json.source_txn, 16);
      if (json.dest_txn) {
        this.dest_txn = new U256(json.dest_txn, 16);
      }

      if (json.signature) {
        this.r = new U256(json.signature.r, 16);
        this.s = new U256(json.signature.s, 16);
        this.v = new U8(json.signature.v, 16);
      }
      
      return false
    }
    catch (e) {
      console.log(`BscMintInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  fromBlock(block: Block, amount: U128 | undefined) {
    const j = block.json();
    this.from = j.account;
    this.to = (j.extensions as Extension[]).find(x => x['type'] === 'note')?.value || '';
    this.timestamp = +j.timestamp;
    this.state = 'paying';
    this.source_txn = block.hash();
    if (amount) this.amount = amount;
  }
}

export class BscRedeemItem {
  from: string = '';
  to: string = '';
  state: string = '';
  amount: U128 = new U128(0);
  timestamp: number = 0;
  source_txn: U256 = new U256(0);
  dest_txn: U256 = new U256(0);
  confirmations: string = '';

  fromJson(json: any): boolean {
    try {
      this.from = json.from;
      this.to = json.to;
      this.state = json.state;
      this.amount = new U128(json.amount);
      this.timestamp = +json.timestamp;
      this.source_txn = new U256(json.source_txn, 16);
      if (!json.source_txn) {
        console.log(`Invalid redeem_item(${json})`);
      }
      if (json.dest_txn) {
        this.dest_txn = new U256(json.dest_txn, 16);
      }

      if (json.bsc_confirmations) {
        this.confirmations = json.bsc_confirmations;
      }
      
      return false
    }
    catch (e) {
      console.log(`BscRedeemInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

class BscMintAccountInfo {
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
  itemSize: number = 10;
  all: boolean = false;
  items: BscMintItem[] = [];
}

class BscRedeemAccountInfo {
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
  itemSize: number = 10;
  all: boolean = false;
  items: BscRedeemItem[] = [];
  balance: U128 | undefined;
  balanceNextSyncAt: number = 0;
  balanceFastSyncCount: number = 0;
}
