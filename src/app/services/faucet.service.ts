import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { U128, U64, U256 } from './util.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { Subject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FaucetService implements OnDestroy {
  private globalState: GlobalState = new GlobalState();
  private accounts: {[account:string]: AccountInfo} = {};
  private SERVICE = 'bsc_faucet';
  private timerSync: any = null;
  private timerUpdateClaimable: any = null;

  private bindSubject = new Subject<{error: boolean; info?:string}>();
  public bindResult$ = this.bindSubject.asObservable();

  private claimSubject = new Subject<{error: boolean; info?:string, amount?:U128}>();
  public claimResult$ = this.claimSubject.asObservable();

  constructor(
    private server: ServerService
  ) { 
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 1000);
    this.timerUpdateClaimable = setInterval(() => this.updateClaimable(), 1000);
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
      console.log('FaucetService destroyed.')
    }
    if (this.timerUpdateClaimable) {
      clearInterval(this.timerUpdateClaimable);
      this.timerUpdateClaimable = null;
    }
  }

  addAccount(address: string) {
    if (!address) return;
    address = address.toLowerCase();
    if (this.accounts[address]) {
      return;
    }
    const account = new AccountInfo();
    this.accounts[address] = account;
  }

  bind(account: string, recipient: string, timestamp: string, signature: string) {
    const message: any = {
      action: 'bind',
      service: this.SERVICE,
      account: account,
      to: recipient,
      timestamp: timestamp,
      signature: signature,
      request_id: account
    };
    this.server.send(message);
  }

  waitingTime(address: string): number {
    address = address.toLowerCase();
    if (!this.accounts[address] || !this.accounts[address].synced) {
      return 0;
    }

    const day = 86400;
    const now = this.server.getTimestamp();
    const last = this.accounts[address].last_claim.toNumber()
    if (now > last + day) {
      return 0;
    }

    if (last > now) return day;

    return last + day - now;
  }

  synced(address: string): boolean {
    address = address.toLowerCase();
    if (!this.accounts[address]) return false;
    return this.accounts[address].synced;
  }

  boundAccount(address: string): string {
    address = address.toLowerCase();
    if (!this.accounts[address]) return '';
    if (address.startsWith('rai_')) {
      return this.accounts[address].account;
    } else if (address.startsWith('0x')) {
      return this.accounts[address].to;
    } else {
      return '';
    }
  }

  claim(account: string, amount: U128) {
    const message: any = {
      action: 'claim',
      service: this.SERVICE,
      account: account,
      amount: amount.toDec(),
    };
    this.server.send(message);
  }

  claimable(): U128 {
    if (!this.globalState.faucetInfo.synced) return new U128(0);
    return this.globalState.faucetInfo.claimable;
  }

  maxClaimable(address: string): U128 {
    address = address.toLowerCase();
    if (!this.accounts[address]) return new U128(0);
    return this.accounts[address].claimable;
  }

  historyItems(): HistoryItem[] {
    return this.globalState.history.items;
  }

  historySynced(): boolean {
    return this.globalState.history.synced;
  }

  moreHistory(): boolean {
    return this.globalState.history.more;
  }

  loadMoreHisotry() {
    const history = this.globalState.history;
    history.count += 10;
    while (history.count < history.items.length) {
      history.count += 10;
    }
    this.syncHistory();
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

    for (let address in this.accounts) {
      let info = this.accounts[address];
      if (info.nextSyncAt > now && !force) continue;
      this.subscribeAccountInfo(address);
      this.syncAccountInfo(address);

      if (info.synced && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      }
      else {
        info.nextSyncAt = now + 1500;
      }
    }

    if (force || this.globalState.nextSyncAt <= now) {
      this.subscribeGlobalState();
      this.syncFaucetInfo();
      this.syncHistory();

      if (this.globalState.subscribed && this.globalState.faucetInfo.synced && this.globalState.history.synced) {
        this.globalState.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      }
      else {
        this.globalState.nextSyncAt = now + 1500;
      }
    }
  }

  private syncAccountInfo(address: string) {
    const message: any = {
      action: 'account_info',
      service: this.SERVICE,
      account: address,
      request_id: address
    };
    this.server.send(message);
  }

  private subscribeAccountInfo(address: string) {
    let filterKey = '';
    if (address.startsWith('rai_')) {
      filterKey = 'rai_account';
    } else if (address.startsWith('0x')) {
      filterKey = 'bsc_account';
    } else {
      return;
    }
    
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{key:filterKey, value:address}],
      request_id: `account:${address}`
    };
    this.server.send(message);
  }

  private syncFaucetInfo() {
    const message: any = {
      action: 'faucet_info',
      service: this.SERVICE,
    };
    this.server.send(message);
  }

  private syncHistory(append: boolean = false) {
    let request_id = '';
    const history =  this.globalState.history;
    let count = history.count;
    let index = -1;
    if (append) {
      request_id = 'append';
      if (history.items.length >= history.count) return;
      count = history.count - history.items.length;

      if (history.items.length) {
        index = history.items[history.items.length - 1].index - 1;
      }
    }

    const message: any = {
      action: 'history',
      service: this.SERVICE,
      count: count,
      request_id: request_id
    };
    if (index >= 0) {
      message['index'] = index;
    }
    this.server.send(message);
  }

  private subscribeGlobalState() {
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{key:'global_state', value:'all'}],
      request_id: 'global_state:all'
    };
    this.server.send(message);
  }

  private processMessage(message: any) {
    if (!message.service || message.service !== this.SERVICE) return;

    if (message.ack) {
      switch (message.ack) {
        case 'service_subscribe':
          this.processServiceSubscribe(message);
          break;
        case 'history':
          this.processHistoryAck(message);
          break;
        case 'faucet_info':
          this.processFaucetInfo(message);
          break;
        case 'account_info':
          this.processAccountInfo(message);
          break;
        case 'bind':
          this.processBindAck(message);
          break;
        case 'claim':
          this.processClaimAck(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'history':
          this.processHistoryNotify(message);
          break;
        case 'faucet_info':
          this.processFaucetInfo(message);
          break;
        case 'account_info':
          this.processAccountInfo(message);
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
    if (id.startsWith('account:')) {
      const address = id.substring(8);
      const info = this.accounts[address];
      if (!info) return;
      if (message.error) {
        info.subscribed = false;
        info.nextSyncAt = 0;
      } else {
        info.subscribed = true;
      }
    } else if (id.startsWith('global_state:')) {
      if (message.error) {
        this.globalState.subscribed = false;
        this.globalState.nextSyncAt = 0;
      } else {
        this.globalState.subscribed = true;
      }
    }
  }

  private processHistoryAck(message: any) {
    if (message.error) {
      console.log(`processHistoryAck: error=${message.error}`);
      return;
    }
    const append = message.request_id === 'append';

    const history = this.globalState.history;
    if (!append) {
      history.items = [];
      history.synced = true;
      history.more = message.more === 'true';  
    }

    for (let i of message.items) {
      const item = new HistoryItem();
      const error = item.fromJson(i);
      if (error) continue;
      this.addHistoryItem(history.items, item);
    }
  }

  private addHistoryItem(history: HistoryItem[], item: HistoryItem) {
    const length = history.length;
    if (length === 0 || (history[length - 1].index - 1) === item.index) {
      history.push(item);
      return;
    }

    let i = 0;
    for (; i < length; ++i) {
      if (history[i].index === item.index) {
        history[i] = item;
        return;
      } else if (history[i].index < item.index) {
        break;
      }
    }

    if (i >= length) {
      history.push(item);
    } else {
      history.splice(i, 0, item);
    }
  }

  private processFaucetInfo(message: any) {
    if (message.error) {
      console.log(`processFaucetInfo: error=${message.error}`);
      return;
    }
    let info = this.globalState.faucetInfo;

    const error = info.fromJson(message);
    if (error) {
      info.synced = false;
      this.globalState.nextSyncAt = 0;
      return;
    }

    info.synced = true;
    this.updateClaimable();
  }

  private processAccountInfo(message: any) {
    if (message.error) {
      console.log(`processAccountInfo: error=${message.error}`);
      return;
    }
    const accounts = this.accounts;

    const keys = ['request_id', 'account', 'to'];
    for (let key of keys) {
      if (message[key]) {
        const address = message[key];
        if (accounts[address]) {
          const error = accounts[address].fromJson(message);
          if (error) {
            accounts[address].synced = false;
            accounts[address].nextSyncAt = 0;
          } else {
            if (key === 'request_id') {
              accounts[address].synced = true;
            }
          }
        }
      }
    }
  }

  private processBindAck(message: any) {
    if (message.error) {
      this.bindSubject.next({error:true, info:message.error});
    } else {
      this.bindSubject.next({error:false});
    }
  }

  private processClaimAck(message: any) {
    if (message.error) {
      this.claimSubject.next({error:true, info:message.error});
    } else {
      const amount = new U128(message.amount);
      this.claimSubject.next({error:false, amount:amount});
    }
  }

  private processHistoryNotify(message: any) {
    const item = new HistoryItem();
    const error = item.fromJson(message);
    if (error) return;
    this.addHistoryItem(this.globalState.history.items, item);
  }

  private updateClaimable() {
    let info = this.globalState.faucetInfo;
    if (!info.synced) return;

    const now = new U64(this.server.getTimestamp());
    const amount = this.rewardAmount(info.unpooled, info.timestamp, now);

    const income = info.income.plus(amount);
    if (income.gt(info.payout)) {
      info.claimable = income.minus(info.payout);
    } else {
      info.claimable = new U128(0);
    }
  }

  private rewardRate(timestamp: U64): U128 {
    const epoch = new U64(environment.epoch_timestamp);
    const rates = [
      7800, 4600, 3200, 2500,
      1500, 1500, 1200, 1200,
       620,  620,  620,  620,
       270,  270,  270,  270
    ];
    const unit = new U128(1000);
    const quarter = new U64(7776000);
    const maxQuarters = 16;

    if (timestamp.lt(epoch)) return new U128(0);
    if (timestamp.gte(epoch.plus(quarter.mul(maxQuarters)))) {
      return unit.mul(140);
    }

    const index = timestamp.minus(epoch).idiv(quarter).toNumber();
    return unit.mul(rates[index]);
  }

  private rewardAmount(balance: U128, begin: U64, end: U64): U128 {
    const epoch = new U64(environment.epoch_timestamp);
    const day = 86400;
    const rai = U128.RAI();

    if (begin.gt(end) || begin.lt(epoch)) {
      return new U128(0);
    }

    const balanceSafe = new U256(balance);
    const rate = this.rewardRate(end);
    const duration = end.minus(begin);

    const amount = balanceSafe.mul(rate).mul(duration).idiv(day).idiv(rai);
    return new U128(amount, 10, false);
  }

}// FaucetService

class AccountInfo {
  account: string = '';
  to: string = '';
  claimable: U128 = new U128(0);
  last_claim: U64 = new U64(0);
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.to = json.to;
      this.claimable = new U128(json.claimable);
      this.last_claim = new U64(json.last_claim);
      return false;
    }
    catch (e) {
      console.log(`AccountInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

class FaucetInfo {
  timestamp: U64 = new U64(0);
  unpooled: U128 = new U128(0);
  income: U128 = new U128(0);
  payout: U128 = new U128(0);
  claimable:U128 = new U128(0);
  synced: boolean = false;

  fromJson(json: any): boolean {
    try {
      this.timestamp = new U64(json.timestamp);
      this.unpooled = new U128(json.unpooled);
      this.income = new U128(json.income);
      this.payout = new U128(json.payout);
      return false;
    }
    catch (e) {
      console.log(`FaucetInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

export class HistoryItem {
  index: number = 0;
  height: U64 = new U64(0);
  hash: U256 = new U256(0);
  amount: U128 = new U128(0);
  to: string = '';
  timestamp:number = 0;

  fromJson(json: any): boolean {
    try {
      this.index = +json.index;
      this.height = new U64(json.height);
      this.hash = new U256(json.hash, 16);
      this.amount = new U128(json.amount);
      this.to = json.to;
      this.timestamp = +json.timestamp;
      return false;
    }
    catch (e) {
      console.log(`HistoryItem.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

class History {
  items: HistoryItem[] = [];
  count: number = 10;
  more: boolean = false;
  synced: boolean = false;
}

class GlobalState {
  faucetInfo: FaucetInfo = new FaucetInfo();
  history: History = new History();
  subscribed: boolean = false;
  nextSyncAt: number = 0;
}

marker('signature is outdated');
marker('invalid timestamp');
marker('invalid signature');
marker('server error, failed to get infomation from BSC chain');
marker('your BSC account should hold some BNB, BEP20 RAI or liquidity before binding');
marker('binding');
marker('the account has not been bound to any BSC account yet');
marker('invalid claim amount');
marker('please be patient, you can claim only once in 24 hours');
marker('not enough balance');