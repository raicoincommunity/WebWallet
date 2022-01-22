import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { WalletsService } from './wallets.service';
import { U64, U256, TokenType, U8, TokenHelper} from './util.service';

@Injectable({
  providedIn: 'root'
})
export class TokenService implements OnDestroy {
  private SERVICE = 'token';
  private accounts: {[account: string]: AccountTokensInfo} = {};
  private timerSync: any = null;


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
    const info = new AccountTokensInfo();
    info.address = address;

    this.accounts[address] = info;
    this.ongoingSync();
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

      this.subscribe(address);
      this.queryAccountTokensInfo(address);
      // todo:

      if (info.subscribed) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      }
      else {
        info.nextSyncAt = now + 1500;
      }
    }
  }

  private subscribe(address: string) {
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      filters: [{key:'account', value:address}],
      request_id: `account:${address}`
    };
    this.server.send(message);
  }

  private queryAccountTokensInfo(address: string) {
    const message: any = {
      action: 'account_tokens_info',
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
        case 'account_synchronize':
          this.processAccountSyncAck(message);
          break;
          case 'account_tokens_info':
            this.processAccountTokensInfoQueryAck(message);
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

  private processAccountSyncAck(message: any) {
    if (!message.request_id || message.error || !message.synchronized) return;

    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);

    const info = this.accounts[address];
    if (!info) return;
    info.synced = message.synchronized === 'true';
  }

  private processAccountTokensInfoQueryAck(message: any) {
    if (!message.request_id || message.error) return;
    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);
    const info = this.accounts[address];
    if (!info) return;

  }

  private processAccountSyncNotify(message: any) {
    if (!message.account || !message.synchronized) return;

    const info = this.accounts[message.account];
    if (!info) return;
    info.synced = message.synchronized === 'true';
  }

  private updateAccountTokensInfo(address: string, json: any) {
    const info = this.accounts[address];
    if (!info) return;
    try {
      info.headHeight = new U64(json.head_height);
      info.tokenBlockCount = new U64(json.token_block_count);
      if (json.tokens) {
        for (let i of json.tokens)
        {
          const token = new AccountTokenInfo();
          const error = token.fromJson(i);
          if (error) continue;
          info.updateToken(token);
        }
      }
      return false;
    }
    catch (e) {
      console.log(`updateAccountTokensInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

class AccountTokenInfo {
  chain: string = '';
  address: string = ''; // token address
  addressRaw: U256 = new U256();
  name: string = '';
  symbol: string = '';
  type: TokenType = TokenType.INVALID;
  decimals: U8 = new U8();
  balance: U256 = new U256();
  balanceFormatted: string = '';
  headHeight: U64 = U64.max();
  tokenBlockCount: U64 = new U64();

  //local data
  expectedRecentBlocks: number = 10;
  actualRecentBlocks: number = 0;
  actualHeadHeight: U64 = U64.max();
  actualTailHeight: U64 = U64.max();

  fromJson(json: any): boolean {
    try {
      this.chain = json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      this.name = json.name;
      this.symbol = json.symbol;
      this.type = TokenHelper.toType(json.type);
      this.decimals = new U8(json.decimals);
      this.balance = new U256(json.balance);
      this.balanceFormatted = json.balance_formatted;
      this.headHeight = new U64(json.head_height);
      this.tokenBlockCount = new U64(json.token_block_count);
      return false;
    }
    catch (e) {
      console.log(`AccountTokenInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  copyLocalData(other: AccountTokenInfo) {
    this.expectedRecentBlocks = other.expectedRecentBlocks;
    this.actualRecentBlocks = other.actualRecentBlocks;
    this.actualHeadHeight = other.actualHeadHeight;
    this.actualTailHeight = other.actualTailHeight;
  }
}

class AccountTokensInfo {
  address: string = '';
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;

  headHeight: U64 = U64.max();
  tokenBlockCount: U64 = new U64();
  tokens: AccountTokenInfo[] = [];

  updateToken(token: AccountTokenInfo) {
    // todo:
  }
}