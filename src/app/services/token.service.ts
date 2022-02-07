import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { WalletsService, WalletOpResult, WalletErrorCode } from './wallets.service';
import { U64, U256, TokenType, U8, TokenHelper, U32, ChainHelper, Chain, ChainStr, ExtensionTypeStr, TokenTypeStr, ExtensionTokenOpStr } from './util.service';
import { environment } from '../../environments/environment';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TokenService implements OnDestroy {
  private SERVICE = 'token';
  private accounts: {[account: string]: AccountTokensInfo} = {};
  private tokenBlocks: {[accountHeight: string]: TokenBlock} = {};
  private tokenInfos: {[chainAddress: string]: TokenInfo} = {};
  private receivings: {[key: string]: boolean} = {};
  private timerSync: any = null;
  private issuerSubject = new Subject<{account: string, created: boolean}>();

  public issuer$ = this.issuerSubject.asObservable();

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

  issued(address: string): boolean {
    const info = this.accounts[address];
    if (!info) return false;
    return info.issuerInfo.created;
  }

  issuerQueried(address: string): boolean {
    if (!address) return false;
    const info = this.accounts[address];
    if (!info) return false;
    return info.issuerInfo.queried;
  }

  tokenInfo(address: string | U256, chain?: string): TokenInfo | undefined {
    if (!chain) {
      chain = environment.current_chain;
    }
    if (typeof address === 'string') {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) return;
      address = ret.raw!;
    }
    return this.getTokenInfo(chain, address);
  }

  receivables(account?: string): TokenReceivable[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    if (!this.accounts[account]) return [];
    return this.accounts[account].receivables;
  }

  receivablesQuery(account: string) {
    this.queryTokenReceivables(account);
  }

  receive(account: string, key: string): WalletOpResult {
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[account];
    if (!info) return ignored;
    const index = info.receivables.findIndex(x => x.key() === key);
    if (index === -1) return ignored;
    const receivable = info.receivables[index];

    const value = {
      op: ExtensionTokenOpStr.RECEIVE,
      chain: receivable.token.chain,
      type: receivable.token.type,
      address_raw: receivable.token.addressRaw.toHex(),
      source: receivable.sourceType,
      from_raw: receivable.fromRaw.toHex(),
      block_height: receivable.blockHeight.toDec(),
      tx_hash: receivable.txHash.toHex(),
      value: receivable.value.toDec(),
      unwrap_chain: receivable.sourceType === 'unwrap' ? receivable.chain : undefined
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      return result;
    }

    this.receivings[receivable.key()] = true;
    info.receivables.splice(index, 1);
    return result;
  }

  tokens(account?: string): AccountTokenInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.tokens;
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
      this.queryTokenInfo(environment.current_chain, address);
      this.queryTokenReceivables(address);
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

  private queryTokenInfo(chain: string, address: string | U256) {
    const message: any = {
      action: 'token_info',
      service: this.SERVICE,
      chain
    };
    if (address instanceof U256) {
      message.address_raw = address.toHex();
    } else {
      message.address = address;
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
        case 'account_synchronize':
          this.processAccountSyncAck(message);
          break;
        case 'account_tokens_info':
          this.processAccountTokensInfoQueryAck(message);
          break;
        case 'account_token_link':
          this.processAccountTokenLinkQueryAck(message);
          break;
        case 'next_account_token_links':
          this.processAccountTokenLinksQueryAck(message, false);
          break;
        case 'next_token_blocks':
          this.processTokenBlocksQueryAck(message, false);
          break;
        case 'previous_account_token_links':
          this.processAccountTokenLinksQueryAck(message, true);
          break;
        case 'previous_token_blocks':
          this.processTokenBlocksQueryAck(message, true);
          break;
        case 'token_info':
          this.processTokenInfoQueryAck(message);
          break;
        case 'token_receivables':
          this.processTokenReceivablesQueryAck(message);
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
        case 'token_info':
          this.processTokenInfoNotify(message);
          break;
        case 'token_received':
          this.processTokenReceivedNotify(message);
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
    this.updateAccountTokensInfo(address, message);
  }

  private processAccountTokenLinkQueryAck(message: any) {
    if (message.error) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const height = new U64(message.height);
    const chain = message.chain;
    const addressRaw = new U256(message.address_raw, 16);
    const token = info.getToken(chain, addressRaw);
    if (!token) return;

    const link = new TokenBlockLink();
    let error = link.fromJson(message);
    if (error) return;

    const tokenBlock = new TokenBlock();
    error = tokenBlock.fromJson(message);
    if (error) return;

    token.tokenBlockLinks.pushFront(link);
    this.putTokenBlock(account, height, tokenBlock);
    this.syncAccountTokenLinks(account, token);
  }

  private processAccountTokenLinksQueryAck(message: any, isPrevious: boolean) {
    if (message.error || !message.token_links) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const chain = message.chain;
    const addressRaw = new U256(message.address_raw, 16);
    const token = info.getToken(chain, addressRaw);
    if (!token) return;

    for (let i of message.token_links) {
      const height = new U64(i.height);
      const link = new TokenBlockLink();
      let error = link.fromJson(i);
      if (error) return;
  
      const tokenBlock = new TokenBlock();
      error = tokenBlock.fromJson(i);
      if (error) return;
      
      if (isPrevious) {
        token.tokenBlockLinks.pushBack(link);
      } else {
        token.tokenBlockLinks.pushFront(link);
      }
      this.putTokenBlock(account, height, tokenBlock);
    }
    this.syncAccountTokenLinks(account, token);
  }

  private processTokenBlocksQueryAck(message: any, isPrevious: boolean) {
    if (message.error || !message.token_blocks) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;

    for (let i of message.token_blocks) {
      const height = new U64(i.height);
      const link = new TokenBlockLink();
      let error = link.fromJson(i);
      if (error) return;
  
      const tokenBlock = new TokenBlock();
      error = tokenBlock.fromJson(i);
      if (error) return;
      if (isPrevious) {
        info.tokenBlockLinks.pushBack(link);
      } else {
        info.tokenBlockLinks.pushFront(link);
      }
      this.putTokenBlock(account, height, tokenBlock);
    }
    this.syncTokenBlocks(account, info);
  }

  private processTokenInfoQueryAck(message: any) {
    if (!message.chain || !message.address || !message.address_raw) return;
    if (message.error) {
      if (message.error === "The token doesn't exist") {
        if (!this.isRaicoin(message.chain)) return;
        const info = this.accounts[message.address];
        if (!info) return;
        info.issuerInfo.queried = true;
        this.issuerSubject.next({account: message.address, created: info.issuerInfo.created});
      }
      return;
    }

    const tokenInfo = new TokenInfo();
    let error = tokenInfo.fromJson(message);
    if (error) return;
    this.putTokenInfo(tokenInfo.chain, tokenInfo.addressRaw, tokenInfo);

    if (this.isRaicoin(tokenInfo.chain)) {
      const info = this.accounts[message.address];
      if (!info) return;
      info.issuerInfo.queried = true;
      info.issuerInfo.created = true;
      this.issuerSubject.next({account: message.address, created: info.issuerInfo.created});
    }
  }

  private processTokenReceivablesQueryAck(message: any) {
    if (message.error || !message.receivables) return;
    for (let r of message.receivables) {
      this.updateReceivable(r);
    }
  }

  private processAccountSyncNotify(message: any) {
    if (!message.account || !message.synchronized) return;

    const info = this.accounts[message.account];
    if (!info) return;
    info.synced = message.synchronized === 'true';
  }

  private processTokenInfoNotify(message: any) {
    const tokenInfo = new TokenInfo();
    let error = tokenInfo.fromJson(message);
    if (error) return;
    this.putTokenInfo(tokenInfo.chain, tokenInfo.addressRaw, tokenInfo);

    if (this.isRaicoin(tokenInfo.chain)) {
      const info = this.accounts[message.address];
      if (!info) return;
      info.issuerInfo.queried = true;
      info.issuerInfo.created = true;
      this.issuerSubject.next({account: message.address, created: info.issuerInfo.created});
    }
  }

  private processTokenReceivedNotify(message: any) {
    try {
      const key = `${message.to}_${message.token.chain}_${message.token.address}_${message.chain}_${message.tx_hash}`;

      if (this.receivings[key]) {
        delete this.receivings[key];
      }

      const info = this.accounts[message.to];
      if (!info) return;
      const index = info.receivables.findIndex(x => x.key() === key);
      if (index !== -1) {
        info.receivables.splice(index, 1);
      }
    }
    catch (e) {
      console.log(`TokenService.processTokenReceivedNotify: failed to parse message=`, message);
    }
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
          this.syncAccountTokenLinks(address, token);
        }
      }
      this.syncTokenBlocks(address, info);
      return false;
    }
    catch (e) {
      console.log(`updateAccountTokensInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  private syncAccountTokenLinks(account: string, info: AccountTokenInfo) {
    if (!info.tokenBlockLinks.upToDate(info.headHeight)) {
      if (info.tokenBlockLinks.empty()) {
        this.queryAccountTokenLink(account, info.headHeight, info.chain, info.address);
      } else {
        this.queryNextAccountTokenLinks(account, info.tokenBlockLinks.frontHeight(), info.chain, info.address);
      }
      return;
    }

    if (info.tokenBlockLinks.size() >= info.expectedRecentBlocks) return;
    const back = info.tokenBlockLinks.back();
    if (!back.valid() || !back.previous.valid()) return;

    const count = info.expectedRecentBlocks - info.tokenBlockLinks.size();
    this.queryPreviousAccountTokenLinks(account, back.self, info.chain, info.address, count);
  }

  private syncTokenBlocks(account: string, info: AccountTokensInfo) {
    if (!info.tokenBlockLinks.upToDate(info.headHeight)) {
      if (info.tokenBlockLinks.empty()) {
        this.queryTokenBlock(account, info.headHeight);
      } else {
        this.queryNextTokenBlocks(account, info.tokenBlockLinks.frontHeight());
      }
      return;
    }

    if (info.tokenBlockLinks.size() >= info.expectedRecentBlocks) return;
    const back = info.tokenBlockLinks.back();
    if (!back.valid() || !back.previous.valid()) return;

    const count = info.expectedRecentBlocks - info.tokenBlockLinks.size();
    this.queryPreviousTokenBlocks(account, back.self, count);
  }

  private queryAccountTokenLink(account: string, height: U64, chain: string, address: string) {
    const message: any = {
      action: 'account_token_link',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address
    };
    this.server.send(message);
  }

  private queryNextAccountTokenLinks(account: string, height: U64,
    chain: string, address: string, count: number = 10) {
    const message: any = {
      action: 'next_account_token_links',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address,
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryPreviousAccountTokenLinks(account: string, height: U64,
    chain: string, address: string, count: number = 10) {
    const message: any = {
      action: 'previous_account_token_links',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address,
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryTokenBlock(account: string, height: U64) {
    const message: any = {
      action: 'token_block',
      service: this.SERVICE,
      account,
      height: height.toDec()
    };
    this.server.send(message);
  }

  private queryNextTokenBlocks(account: string, height: U64, count: number = 10) {
    const message: any = {
      action: 'next_token_blocks',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryPreviousTokenBlocks(account: string, height: U64, count: number = 10) {
    const message: any = {
      action: 'previous_token_blocks',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryTokenReceivables(account: string, count?: U64) {
    const message: any = {
      action: 'token_receivables',
      service: this.SERVICE,
      account,
      count: count ? count.toDec() : '50'
    };
    this.server.send(message);
  }

  private putTokenBlock(account: string, height: U64, token_block: TokenBlock) {
    const key = `${account}_${height.toDec()}`;
    this.tokenBlocks[key] = token_block;
  }

  private getTokenBlock(account: string, height: U64): TokenBlock | undefined {
    const key = `${account}_${height.toDec()}`;
    return this.tokenBlocks[key];
  }

  private putTokenInfo(chain: string, addressRaw: U256, info: TokenInfo) {
    const key = `${chain}_${addressRaw.toHex()}`;
    this.tokenInfos[key] = info;
  }

  private getTokenInfo(chain: string | Chain, addressRaw: U256): TokenInfo | undefined {
    if (typeof chain === 'number') {
      chain = ChainHelper.toChainStr(chain);
    }
    const key = `${chain}_${addressRaw.toHex()}`;
    return this.tokenInfos[key];
  }

  private isRaicoin(chain: string): boolean {
    return ChainStr.RAICOIN === chain || ChainStr.RAICOIN_TEST === chain;
  }

  private updateReceivable(json: any) {
    const receivable = new TokenReceivable();
    const error = receivable.fromJson(json);
    if (error) return;
    if (!receivable.to) {
      console.log(`TokenService.updateReceivable: invalid to=${receivable.to}`);
      return;
    }
    const info = this.accounts[receivable.to];
    if (!info) return;
    if (this.receivings[receivable.key()]) return;
    if (info.receivables.find(x => x.key() === receivable.key())) return;
    info.receivables.push(receivable);
  }

}

export class AccountTokenInfo {
  chain: string = '';
  chainShown: string = '';
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
  tokenBlockLinks: TokenBlockLinks = new TokenBlockLinks();

  fromJson(json: any): boolean {
    try {
      this.chain = json.token.chain;
      this.chainShown = ChainHelper.toChainShown(this.chain);
      this.address = json.token.address;
      this.addressRaw = new U256(json.token.address_raw, 16);
      this.name = json.token.name;
      this.symbol = json.token.symbol;
      this.type = TokenHelper.toType(json.token.type);
      this.decimals = new U8(json.token.decimals);
      this.balance = new U256(json.balance);
      this.balanceFormatted = json.balance_formatted;
      this.headHeight = new U64(json.head_height);
      this.tokenBlockCount = new U64(json.token_block_count);
      return false;
    }
    catch (e) {
      console.log('AccountTokenInfo.fromJson: failed to parse json=', json, ', exception=', e);
      return true;
    }
  }

  copyLocalData(other: AccountTokenInfo) {
    this.expectedRecentBlocks = other.expectedRecentBlocks;
    this.tokenBlockLinks = other.tokenBlockLinks;
  }
}

class AccountTokensInfo {
  address: string = '';
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
  issuerInfo: IssuerInfo = new IssuerInfo();

  headHeight: U64 = U64.max();
  tokenBlockCount: U64 = new U64();
  tokens: AccountTokenInfo[] = [];
  receivables: TokenReceivable[] = [];

  //local data
  expectedRecentBlocks: number = 10;
  tokenBlockLinks: TokenBlockLinks = new TokenBlockLinks();

  updateToken(token: AccountTokenInfo) {
    const index = this.tokens.findIndex(
      x => x.chain === token.chain && x.addressRaw.eq(token.addressRaw));
    if (index === -1) {
      this.tokens.push(token);
      this.sortTokens();
    } else {
      token.copyLocalData(this.tokens[index]);
      this.tokens[index] = token;
    }
  }

  sortTokens() {
    this.tokens.sort((lhs, rhs) => {
      if (lhs.symbol.toUpperCase() < rhs.symbol.toUpperCase()) {
        return -1;
      }
      if (lhs.symbol.toUpperCase() > rhs.symbol.toUpperCase()) {
        return 1;
      }
      if (lhs.chain < rhs.chain) {
        return -1;
      }
      if (lhs.chain > rhs.chain) {
        return 1;
      }
      return 0;
    });
  }

  getToken(chain: string, addressRaw: U256): AccountTokenInfo | undefined {
    return this.tokens.find(x => x.chain === chain && x.addressRaw.eq(addressRaw));
  }

}

class TokenBlock {
  status: string = '';
  statusCode: U32 = new U32();
  hash: U256 = new U256();
  block: any = null;
  value: U256 = new U256();
  valueOp: string = '';
  chain: string = '';
  address: string = ''; 
  addressRaw: U256 = new U256();
  name: string = '';
  symbol: string = '';
  type: TokenType = TokenType.INVALID;
  decimals: U8 = new U8();

  fromJson(json: any): boolean {
    try {
      this.status = json.status;
      this.statusCode = new U32(json.status_code);
      this.hash = new U256(json.hash, 16);
      this.block = json.block;
      this.value = new U256(json.value);
      this.valueOp = json.value_op;
      this.chain = json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (this.chain !== 'invalid' && !this.addressRaw.eq(0)) {
        this.name = json.name;
        this.symbol = json.symbol;
        this.type = TokenHelper.toType(json.type);
        this.decimals = new U8(json.decimals);  
      }
      return false;
    }
    catch (e) {
      console.log(`TokenBlock.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  getExtension(): any {
    if (!this.statusCode.eq(0)) return null;
    if (!this.block || !this.block.extensions) return null;
    for (let i of this.block.extensions) {
      if (i.type === 'token') {
        return i.value;
      }
    }
    return null;
  }
}

class TokenBlockLink {
  self: U64 = U64.max()
  previous: U64 = U64.max();
  successor: U64 = U64.max();

  fromJson(json: any): boolean {
    try {
      this.self = new U64(json.height);
      this.previous = new U64(json.previous_height);
      this.successor = new U64(json.successor_height);
      return false;
    }
    catch (e) {
      console.log(`TokenBlockLink.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  valid(): boolean {
    return this.self.valid();
  }
}

class TokenBlockLinks {
  links: TokenBlockLink[] = [];

  upToDate(head: U64): boolean {
    if (!head.valid()) return true;
    if (this.empty()) return false;
    return this.links[0].self.eq(head);
  }

  size(): number {
    return this.links.length;
  }

  empty(): boolean {
    return this.size() === 0;
  }

  frontHeight(): U64 {
    if (this.empty()) return U64.max();
    return this.links[0].self;
  }

  back(): TokenBlockLink {
    if (this.empty()) return new TokenBlockLink();
    return this.links[this.size() - 1];
  }

  pushFront(link: TokenBlockLink) {
    if (this.empty()) {
      this.links.push(link);
      return;
    }
    
    if (link.previous.eq(this.frontHeight())) {
      this.links[0].successor = link.self;
      this.links.splice(0, 0, link);
    }
  }

  pushBack(link: TokenBlockLink) {
    if (this.empty()) {
      this.links.push(link);
      return;
    }

    if (this.back().previous.eq(link.self)) {
      this.links.push(link);
    }
  }

}

export class TokenInfo {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256();
  type: TokenType = TokenType.INVALID;
  symbol: string = '';
  name: string = '';
  decimals: U8 = new U8();
  burnable: boolean = false;
  mintable: boolean = false;
  circulable: boolean = false;
  holders: U64 = new U64();
  transfers: U64 = new U64();
  swaps: U64 = new U64();
  created_at: U64 = new U64();
  totalSupply: U256 = new U256();
  totalSupplyFormatted: string = '';
  capSupply: U256 = new U256();
  capSupplyFormatted: string = '';
  localSupply: U256 = new U256();
  localSupplyFormatted: string = '';
  base_uri: string = '';

  fromJson(json: any): boolean {
    try {
      this.chain = json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      this.type = TokenHelper.toType(json.type);
      this.symbol = json.symbol;
      this.name = json.name;
      this.decimals = new U8(json.decimals);
      this.burnable = json.burnable === 'true';
      this.mintable = json.mintable === 'true';
      this.circulable = json.circulable === 'true';
      this.holders = new U64(json.holders);
      this.transfers = new U64(json.transfers);
      this.swaps = new U64(json.swaps);
      this.created_at = new U64(json.created_at);
      this.totalSupply = new U256(json.total_supply);
      this.totalSupplyFormatted = json.total_supply_formatted;
      this.capSupply = new U256(json.cap_supply);
      this.capSupplyFormatted = json.cap_supply_formatted;
      this.localSupply = new U256(json.local_supply);
      this.localSupplyFormatted = json.local_supply_formatted;
      this.base_uri = json.base_uri;
      return false;
    }
    catch (e) {
      console.log(`TokenInfo.fromJson: failed to parse json=`, json, 'exception=', e);
      return true;
    }
  }

}

class IssuerInfo {
  queried: boolean = false;
  created: boolean = false;
}

export class TokenReceivableTokenInfo {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256();
  type: string = '';
  name: string = '';
  symbol: string = '';
  decimals: U8 = new U8();

  fromJson(json: any): boolean {
    try {
      this.chain =  json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      this.type = json.type;
      this.name = json.name;
      this.symbol = json.symbol;
      this.decimals = new U8(json.decimals);
      return false;
    }
    catch (e) {
      console.log(`TokenReceivableTokenInfo.fromJson: failed to parse json=`, json, 'exception=', e);
      return true;
    }
  }
}

export class TokenReceivable {
  to: string = '';
  token: TokenReceivableTokenInfo = new TokenReceivableTokenInfo();
  chain: string = '';
  txHash: U256 = new U256();
  from: string = '';
  fromRaw: U256 = new U256();
  value: U256 = new U256();
  blockHeight: U64 = new U64();
  sourceType: string = '';
  block: any = null;

  fromJson(json: any): boolean {
    try {
      this.to = json.to;
      this.token = new TokenReceivableTokenInfo();
      const error = this.token.fromJson(json.token);
      if (error) return true;
      this.chain = json.chain;
      this.txHash = new U256(json.tx_hash, 16);
      this.from = json.from;
      this.fromRaw = new U256(json.from_raw, 16);
      this.value = new U256(json.value);
      this.blockHeight = new U64(json.block_height);
      this.sourceType = json.source;
      this.block = json.block;
      return false;
    }
    catch (e) {
      console.log(`TokenReceivable.fromJson: failed to parse json=`, json, 'exception=', e);
      return true;
    }
  }

  key(): string {
    return `${this.to}_${this.token.chain}_${this.token.address}_${this.chain}_${this.txHash.toHex()}`
  }

  valueFormatted(): string {
    if (this.token.type === TokenTypeStr._721) {
      return '1 ' + this.token.symbol;
    }

    return this.value.toBalanceStr(this.token.decimals) + ' ' + this.token.symbol;
  }

}