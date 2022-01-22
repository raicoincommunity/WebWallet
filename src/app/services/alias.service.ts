import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { ServerService, ServerState } from './server.service';
import { WalletsService } from './wallets.service';

@Injectable({
  providedIn: 'root'
})
export class AliasService implements OnDestroy {
  private accounts: {[account:string]: AliasInfo} = {};
  private timerSync: any = null;
  private SERVICE = 'alias';
  private searchResultSubject = new Subject<{name: string; dns:string, accounts:string[]}>();

  public searchResult$ = this.searchResultSubject.asObservable();


  constructor(
    private server: ServerService,
    private wallets: WalletsService
    ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 1000);
    this.wallets.selectedAccountChanged$.subscribe(address => this.addAccount(address));
    this.addAccount(this.wallets.selectedAccountAddress());
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
    }
  }

  addAccount(address: string) {
    if (!address) return;
    if (this.accounts[address]) {
      return;
    }
    const account = new AliasInfo();
    account.address = address;

    this.accounts[address] = account;
  }

  alias(address: string): string {
    if (!address) return '';
    if (this.dns(address)) {
      return this.name(address) + '@' + this.dns(address);
    }
    return this.name(address);
  }

  queried(address: string): boolean {
    if (!this.accounts[address]) {
      return false;
    }
    return this.accounts[address].queried;
  }

  verified(address: string): boolean {
    if (!this.accounts[address]) {
      return false;
    }
    return this.accounts[address].verified;
  }

  verify(address: string): boolean {
    if (!this.accounts[address]) {
      return true;
    }
    const info = this.accounts[address];
    if (!info.dns) return true;
    this.verifyDns([{account: info.address, dns: info.dns}]);
    return false;
  }

  name(address: string): string {
    if (!this.accounts[address]) {
      return '';
    }
    return this.accounts[address].name;
  }

  dns(address: string): string {
    if (!this.accounts[address]) {
      return '';
    }
    return this.accounts[address].dns;
  }

  dnsValid(address: string): boolean {
    if (!this.accounts[address]) {
      return false;
    }
    return this.accounts[address].dns_valid;
  }

  synced(address: string): boolean {
    if (!this.accounts[address]) {
      return false;
    }
    return this.accounts[address].synced;
  }

  search(name: string, dns: string, count: number = 10) {
    const message: any = {
      action: 'alias_search',
      service: this.SERVICE,
      name: name,
      dns: dns,
      count: '' + count,
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

  private ongoingSync(force?: boolean) {
    if (this.server.getState() !== ServerState.CONNECTED) return;
    const now = window.performance.now();

    for (let address in this.accounts) {
      let info = this.accounts[address];
      if (info.nextSyncAt > now && !force) continue;
      this.subscribeAliasInfo(address);
      this.queryAliasInfo(address);
      this.querySyncInfo(address);
      if (info.dns && !info.dns_valid)
      {
        this.verifyDns([{account: info.address, dns: info.dns}]);
      }

      if (info.queried && info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      }
      else {
        info.nextSyncAt = now + 1500;
      }
    }
  }

  private subscribeAliasInfo(address: string) {
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{key:'account', value:address}],
      request_id: `account:${address}`
    };
    this.server.send(message);
  }

  private queryAliasInfo(address: string) {
    const message: any = {
      action: 'alias_query',
      service: this.SERVICE,
      account: address,
      request_id: `account:${address}`
    };
    this.server.send(message);
  }

  private querySyncInfo(address: string) {
    const message: any = {
      action: 'account_synchronize',
      service: this.SERVICE,
      account: address,
      request_id: `account:${address}`
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
        case 'alias_query':
          this.processAliasQueryAck(message);
          break;
        case 'alias_search':
          this.processAliasSearchAck(message);
          break;
        case 'account_synchronize':
          this.processAccountSyncAck(message);
          break;
        case 'dns_verify':
          this.processDnsVerifyAck(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'account_synchronize':
          this.processAccountSyncNotify(message);
          break;
        case 'alias_change':
          this.processAliasChangeNotify(message);
          break;
        default:
          break;
        }
    }
  }

  private processServiceSubscribe(message: any) {
    if (!message.request_id) {
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
    }
  }

  private updateAlias(address: string, name: string, dns: string) {
    const info = this.accounts[address];
    if (!info) return;
    info.name = name;
    info.queried = true;
    if (info.dns !== dns) {
      info.dns = dns;
      info.verified = false;
      info.dns_valid = false;
      if (dns) {
        this.verifyDns([{account: address, dns: dns}]);
      }
    }
  }

  private processAliasQueryAck(message: any) {
    if (!message.request_id || message.error) return;

    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);
    this.updateAlias(address, message.name, message.dns);
  }

  private processAliasChangeNotify(message: any) {
    this.updateAlias(message.account, message.name, message.dns);
  }

  private processAliasSearchAck(message: any) {
    if (message.error) return;

    const name = message.name;
    const dns = message.dns;
    const accounts: string[] = [];
    const dnsItems: {account: string, dns: string}[] = [];

    if (message.alias)
    {
      for (let i of message.alias)
      {
        accounts.push(i.account);
        if (!this.accounts[i.account]) {
          this.addAccount(i.account);
          const info = this.accounts[i.account];
          info.name = i.name;
          info.dns = i.dns;
          info.queried = true;
          if (i.dns) {
            dnsItems.push({account: i.account, dns: i.dns});
          }
        }
      }
    }

    this.verifyDns(dnsItems);
    this.searchResultSubject.next({name, dns, accounts});
  }

  private processAccountSyncAck(message: any) {
    if (!message.request_id || message.error || !message.synchronized) return;

    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);

    const info = this.accounts[address];
    if (!info) return;
    info.synced = message.synchronized === 'true';
  }

  private processDnsVerifyAck(message: any) {
    if (message.error) return;

    for (let i of message.items) {
      const info = this.accounts[i.account];
      if (!info || info.dns !== i.dns) continue;
      info.dns_valid = i.valid === 'true';
      info.verified = true;
    }
  }

  private processAccountSyncNotify(message: any) {
    if (!message.account || !message.synchronized) return;

    const info = this.accounts[message.account];
    if (!info) return;
    info.synced = message.synchronized === 'true';
  }

  private verifyDns(items: {account: string, dns: string}[]) {
    if (items.length === 0) return;
    const message: any = {
      action: 'dns_verify',
      service: this.SERVICE,
      items: items,
    };
    this.server.send(message);
  }

} // AliasService

class AliasInfo {
  address: string = '';
  name: string = '';
  dns: string = '';
  dns_valid: boolean = false;
  verified: boolean = false;
  subscribed: boolean = false;
  queried: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
}

