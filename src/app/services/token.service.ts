import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { WalletsService, WalletOpResult, WalletErrorCode, Account, Wallet } from './wallets.service';
import { U64, U256, TokenType, U8, TokenHelper, U32, ChainHelper, Chain, ChainStr, ExtensionTypeStr, TokenTypeStr, ExtensionTokenOpStr, U16, TokenSwapSubOpStr, U512, AppHelper, AppTopicType, Z64, ZX } from './util.service';
import { environment } from '../../environments/environment';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { VerifiedTokensService } from './verified-tokens.service';
import { Block } from './blocks.service';

@Injectable({
  providedIn: 'root'
})
export class TokenService implements OnDestroy {
  private readonly SERVICE = 'token';
  private readonly VALIDATOR_SERVICE = 'validator';
  private readonly INVALID_ACCOUNT = U256.zero().toAccountAddress();
  private accounts: {[account: string]: AccountTokensInfo} = {};
  private tokenBlocks: {[accountHeight: string]: TokenBlock} = {};
  private tokenInfos: {[chainAddress: string]: TokenInfo} = {};
  private maxTokenIds: {[account: string]: MaxTokenId} = {};
  private receivings: {[key: string]: boolean} = {};
  private makers: { [account: string]: MakerInfo } = {};
  private takers: { [account: string]: TakerInfo } = {};
  private tokenIdOwners: TokenIdOwnerInfo[] = [];
  private timerSync: any = null;
  private timerSwapData: any = null;
  private tokenInfoQueries: {[chainAddress: string]: number} = {};
  private tokenSymbols: {[chain: string]: {[address: string]: string}} = {};
  private tokenSymbolQueries: {[chainAddress: string]: number} = {};
  private tokenNames: {[chain: string]: {[address: string]: string}} = {};
  private tokenNameQueries: {[chainAddress: string]: number} = {};
  private tokenTypes: {[chain: string]: {[address: string]: TokenType}} = {};
  private tokenTypeQueries: {[chainAddress: string]: number} = {};
  private tokenDecimalsEntries: {[chain: string]: {[address: string]: number}} = {};
  private tokenDecimalsQueries: {[chainAddress: string]: number} = {};
  private tokenWrappedInfos: {[chain: string]: {[address: string]: boolean}} = {};
  private tokenWrappedQueries: {[chainAddress: string]: number} = {};
  private txTimestamps: {[chain: string]: {[hash: string]: number}} = {};
  private txTimestampQueries: {[chainHash:string]: number} = {};
  private issuerSubject = new Subject<{account: string, created: boolean}>();
  private tokenIdSubject = new Subject<{ chain: string, address: string, id: U256, existing: boolean }>();
  private accountSyncedSubject = new Subject<{account: string, synced: boolean}>();
  private tokenInfoSubject = new Subject<{ chain: string, address: string, existing: boolean,
                                           info?: TokenInfo }>();
  private tokenSymbolSubject = new Subject<{ chain: string, address: string, symbol: string }>();
  private tokenNameSubject = new Subject<{ chain: string, address: string, name: string }>();
  private tokenTypeSubject = new Subject<{ chain: string, address: string, type: TokenType }>();
  private tokenDecimalsSubject = new Subject<{ chain: string, address: string, decimals: number }>();
  private tokenWrappedSubject = new Subject<{ chain: string, address: string, wrapped: boolean }>();
  private accountSwapInfoSubject = new Subject<AccountSwapInfo>();
  private orderInfoSubject = new Subject<OrderInfo>();
  private searchOrderSubject = new Subject<{by: string, hash?: U256, fromToken?: TokenKey, toToken?: TokenKey, limitBy?: SearchLimitBy, limitValue?: U256, more?:boolean, orders: OrderInfo[]}>();
  private accountOrdersSubject = new Subject<string>();
  private makersSubject = new Subject();
  private accountSwapsSubject = new Subject<string>();
  private swapSubject = new Subject<SwapFullInfo>();
  private accountTokensSubject = new Subject<string>();
  private tokenUnmapSubject = new Subject<UnmapInfo>();
  private tokenWrapSubject = new Subject<WrapInfo>();

  public issuer$ = this.issuerSubject.asObservable();
  public tokenId$ = this.tokenIdSubject.asObservable();
  public accountSynced$ = this.accountSyncedSubject.asObservable();
  public tokenInfo$ = this.tokenInfoSubject.asObservable();
  public tokenSymbol$ = this.tokenSymbolSubject.asObservable();
  public tokenName$ = this.tokenNameSubject.asObservable();
  public tokenType$ = this.tokenTypeSubject.asObservable();
  public tokenDecimals$ = this.tokenDecimalsSubject.asObservable();
  public tokenWrapped$ = this.tokenWrappedSubject.asObservable();
  public accountSwapInfo$ = this.accountSwapInfoSubject.asObservable();
  public orderInfo$ = this.orderInfoSubject.asObservable();
  public searchOrder$ = this.searchOrderSubject.asObservable();
  public accountOrders$ = this.accountOrdersSubject.asObservable();
  public makers$ = this.makersSubject.asObservable();
  public accountSwaps$ = this.accountSwapsSubject.asObservable();
  public swap$ = this.swapSubject.asObservable();
  public accountTokens$ = this.accountTokensSubject.asObservable();
  public tokenUnmap$ = this.tokenUnmapSubject.asObservable();
  public tokenWrap$ = this.tokenWrapSubject.asObservable();

  constructor(
    private server: ServerService,
    private wallets: WalletsService,
    private settings: SettingsService,
    private verified: VerifiedTokensService
  ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.server.message$.subscribe(message => this.processValidatorMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 3000);
    this.timerSwapData = setInterval(() => this.ongoingUpateSwapData(), 3000);
    this.wallets.addAccount$.subscribe(address => this.addAccount(address));
    this.wallets.forEachAccount(account => this.addAccount(account.address()));
  }

  ngOnDestroy() {
    if (this.timerSync) {
      clearInterval(this.timerSync);
      this.timerSync = null;
    }
    if (this.timerSwapData) {
      clearInterval(this.timerSwapData);
      this.timerSwapData = null;
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

  subscribeOrder(order: OrderInfo) {
    const now = this.server.getTimestamp();
    let info = this.makers[order.maker.account];
    if (!info) {
      info = new MakerInfo();
      info.address = order.maker.account;
      this.makers[info.address] = info;
      info.updateOrder(order, now);
      this.ongoingSync();
    } else {
      const newMainAccount = !info.hasMainAccount(order.mainAccount);
      const inserted = info.updateOrder(order, now);
      if (inserted) {
        this.subscribeTopicOrderById(order.hash);
      }
      if (newMainAccount) {
        this.queryAccountHead(order.mainAccount);
        this.subscribeTopicAccountHead(order.mainAccount);
      }
    }

    this.subscribeTokenIdOwner(order);
  }

  private subscribeTokenIdOwner(order: OrderInfo) {
    if (order.tokenWant.type !== TokenTypeStr._721) return;
    const newInfo = new TokenIdOwnerInfo();
    newInfo.fromParams(order.tokenWant, order.valueWant);
    const info = this.tokenIdOwners.find(x => x.eq(newInfo));
    if (info) {
      info.ref++;
      return;
    }
    newInfo.ref = 1;
    this.tokenIdOwners.push(newInfo);
    this.queryTokenIdOwner(newInfo.address, newInfo.tokenId, newInfo.chain);
    this.subscribeTopicTokenIdOwner(newInfo);
  }

  unsubscribeOrder(order: OrderInfo) {
    let info = this.makers[order.maker.account];
    if (info) {
      info.removeOrder(order);
    }
    this.unsubscribeTokenIdOwner(order);
  }

  private unsubscribeTokenIdOwner(order: OrderInfo) {
    if (order.tokenWant.type !== TokenTypeStr._721) return;
    const newInfo = new TokenIdOwnerInfo();
    newInfo.fromParams(order.tokenWant, order.valueWant);
    const index = this.tokenIdOwners.findIndex(x => x.eq(newInfo));
    if (index === -1) return;
    this.tokenIdOwners[index].ref--;
    if (this.tokenIdOwners[index].ref <= 0) {
      this.tokenIdOwners.splice(index, 1);
    }
  }

  accountTokenInfo(chain: string, address: string | U256, account?: string)
   : AccountTokenInfo | undefined {
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) return undefined;
      address = ret.address!;
    }

    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return undefined;
    for (let i of info.tokens) {
      if (i.chain === chain && i.address === address) {
        return i;
      }
    }
    return undefined;
  }

  accountTokenMaps(chain: string, account?: string): MapInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info || !info.maps[chain]) return [];
    return info.maps[chain].maps;
  }

  accountTokenUnmaps(account?: string): UnmapInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.unmaps.unmaps;
  }

  accountTokenWraps(account?: string): WrapInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.wraps.wraps;
  }

  accountTokenUnwraps(chain: string, account?: string): UnwrapInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info || !info.unwraps[chain]) return [];
    return info.unwraps[chain].unwraps;
  }

  balance(chain: string, address: string, account?: string): { amount: U256, type: TokenType, decimals: U8 } {
    const zero = { amount: U256.zero(), type: TokenType.INVALID, decimals: U8.zero() };
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return zero;

    if (address === '') {
      const ret = ChainHelper.nativeTokenAddress(chain);
      if (ret.error) return zero;
      address = ret.address!;
    }

    for (let i of info.tokens) {
      if (i.chain === chain && i.address === address) {
        return { amount: i.balance, type: i.type, decimals: i.decimals };
      }
    }
    return zero;
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

  mainAccountQueried(address: string): boolean {
    if (!address) return false;
    const info = this.accounts[address];
    if (!info) return false;
    return info.swapMainAccountQueried;
  }

  mainAccountSet(address?: string): boolean {
    if (!address) address = this.wallets.selectedAccountAddress();
    const info = this.accounts[address];
    if (!info) return false;
    return info.swapMainAccount !== '' && info.swapMainAccount !== this.INVALID_ACCOUNT;
  }

  ready(address?: string): boolean {
    if (!address) address = this.wallets.selectedAccountAddress();
    const info = this.accounts[address];
    if (!info) return false;
    return info.synced && info.swapMainAccountQueried && info.swapInfoQueried;
  }

  synced(address?: string): boolean {
    if (!address) address = this.wallets.selectedAccountAddress();
    const info = this.accounts[address];
    if (!info) return false;
    return info.synced;
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

  tokenSymbol(address: string | U256, chain: string): string | undefined {
    if (ChainHelper.isRaicoin(chain)) return undefined;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`TokenService::tokenSymbol: failed to convert raw to address, ${address.toHex()}`);
        return undefined;
      }
      address = ret.address!;
    }
    return this.tokenSymbols[chain]?.[address];
  }

  tokenName(address: string | U256, chain: string): string | undefined {
    if (ChainHelper.isRaicoin(chain)) return undefined;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`TokenService::tokenName: failed to convert raw to address, ${address.toHex()}`);
        return undefined;
      }
      address = ret.address!;
    }
    return this.tokenNames[chain]?.[address];
  }

  tokenType(address: string | U256, chain: string): TokenType | undefined {
    if (ChainHelper.isRaicoin(chain)) return undefined;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`TokenService::tokenType: failed to convert raw to address, ${address.toHex()}`);
        return undefined;
      }
      address = ret.address!;
    }
    return this.tokenTypes[chain]?.[address];
  }

  tokenDecimals(address: string | U256, chain: string): number | undefined {
    if (ChainHelper.isRaicoin(chain)) return undefined;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`TokenService::tokenDecimals: failed to convert raw to address, ${address.toHex()}`);
        return undefined;
      }
      address = ret.address!;
    }
    return this.tokenDecimalsEntries[chain]?.[address];
  }

  tokenWrapped(address: string | U256, chain: string): boolean | undefined {
    if (!ChainHelper.isWrapableChain(chain)) return false;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`TokenService::tokenWrapped: failed to convert raw to address, ${address.toHex()}`);
        return undefined;
      }
      address = ret.address!;
    }
    return this.tokenWrappedInfos[chain]?.[address];
  }

  txTimestamp(chain: string, hash: string): number | undefined {
    hash = hash.toLowerCase();
    if (!hash.startsWith('0x')) {
      hash = '0x' + hash;
    }
    return this.txTimestamps[chain]?.[hash];
  }

  tokenIdOwner(token: TokenKey, tokenId: U256): string {
    const target = new TokenIdOwnerInfo();
    target.fromParams(token, tokenId);
    const info = this.tokenIdOwners.find(x => x.eq(target));
    if (!info) return '';
    return info.owner;
  }

  receivables(account?: string): TokenReceivable[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    if (!this.accounts[account]) return [];
    return this.accounts[account].receivables;
  }

  receivablesQuery(account: string) {
    this.queryTokenReceivablesSummary(account);
  }

  accountActionCheck(account: string | Account, wallet?: Wallet): WalletErrorCode {
    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return WalletErrorCode.UNEXPECTED;
    }

    let address;
    if (typeof account === 'string') {
      address = account;
      const a = wallet.findAccount({address});
      if (!a) {
        return WalletErrorCode.UNEXPECTED;
      }
      account = a;
    } else {
      address = account.address();
    }

    const info = this.accounts[address];
    if (!info) return WalletErrorCode.MISS;

    if (!info.synced || !info.swapInfoQueried) {
      return WalletErrorCode.UNSYNCED;
    }

    if (info.swappingAsMaker()) return WalletErrorCode.PENDING_SWAP;
    if (info.pendingSwapInquiries() > 0) {
      if (this.wallets.txnsLimitRemaining(account) <= info.pendingSwapInquiries()) {
        return WalletErrorCode.CREDIT_RESERVED_FOR_SWAP;
      }  
    }

    return WalletErrorCode.SUCCESS;
  }

  change(address: string, extensions: {[key: string]: any}[], wallet?: Wallet): WalletOpResult  {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return { errorCode: WalletErrorCode.UNEXPECTED };
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }
    return this.wallets.changeExtensions(extensions, account, wallet);
  }

  receive(address: string, key: string, account?: Account, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
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
      unwrap_chain: receivable.sourceType === 'unwrap' ? receivable.chain : undefined,
      index: `${receivable.index}`
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      return result;
    }

    this.receivings[receivable.key()] = true;
    info.receivables.splice(index, 1);
    return result;
  }

  setMainAccount(address: string, mainAccount: string, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const value = {
      op: ExtensionTokenOpStr.SWAP,
      sub_op: TokenSwapSubOpStr.CONFIG,
      main_account: mainAccount
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    return this.wallets.changeExtensions(extensions, account, wallet);
  }

  makeOrder(address: string, value: {[key: string]: string}, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    const info = this.accounts[address]!;
    if (info.orderLimited()) {
      return { errorCode: WalletErrorCode.CREDIT_FOR_ORDER }
    }

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.MAKE;

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    return this.wallets.changeExtensions(extensions, account, wallet);
  }

  cancelOrder(address: string, height: U64, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;

    const order = info.getOrder(height);
    if (!order || order.order.finished()) return ignored;

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const value = {
      op: ExtensionTokenOpStr.SWAP,
      sub_op: TokenSwapSubOpStr.CANCEL,
      order_height: height.toDec()
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      order.cancelSent = true;
    }

    return result;
  }

  swapInquiry(address: string, value: {[key: string]: string}, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return { errorCode: WalletErrorCode.UNEXPECTED };
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return { errorCode: WalletErrorCode.UNEXPECTED };
    }

    if (this.txnsLimitRemaining(account) < 2) {
      return { errorCode: WalletErrorCode.CREDIT };
    }

    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.INQUIRY;

    const info = this.accounts[address];
    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      info.addSwapInquiry(result.block!.height(), new U64(value.timeout));
    }
    return result
  }

  ping(order: OrderInfo, address: string, wallet?: Wallet): WalletOpResult {
    const errorCode = this.accountActionCheck(address, wallet);
    if (errorCode !== WalletErrorCode.SUCCESS) {
      return { errorCode };
    }

    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.makers[order.maker.account];
    if (!info) return ignored;

    const now = this.server.getTimestamp();
    const status = info.calcOrderActionStatus(order, now);
    if (status !== OrderActionStatus.PING) {
      return ignored;
    }

    if (!wallet) {
      wallet = this.wallets.selectedWallet();
    }
    if (!wallet) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const account = wallet.findAccount({address});
    if (!account) {
      return {errorCode: WalletErrorCode.UNEXPECTED};
    }

    const value = {
      op: ExtensionTokenOpStr.SWAP,
      sub_op: TokenSwapSubOpStr.PING,
      maker: order.maker.account,
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);

    if (result.errorCode === WalletErrorCode.SUCCESS) {
      info.lastPing = now;
      info.updateOrderStatus(now);
    }
    return result;
  }

  tokens(account?: string): AccountTokenInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.tokens;
  }

  autoTokenId(account?: string): U256 | undefined {
    if (!account) account = this.wallets.selectedAccountAddress();
    const item = this.maxTokenIds[account];
    if (!item) {
      this.queryTokenMaxId(account);
      return undefined;
    }
    if (!item.valid) return new U256(1);
    if (item.id.eq(U256.max())) return undefined;
    return item.id.plus(1);
  }

  checkTokenId(address: string, id: U256) {
    this.queryTokenIdInfo(address, id);
  }

  tokenBlock(account: string, height: U64): TokenBlock | undefined {
    return this.getTokenBlock(account, height);
  }

  tokenIds(chain: string, address: string, account?: string): AccountTokenId[] {
    const info = this.accountTokenInfo(chain, address, account);
    if (!info) return [];
    return info.tokenIds;
  }

  setTokenIdsSize(chain: string, address: string, num: number, account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accountTokenInfo(chain, address, account);
    if (!info) return;
    info.expectedTokenIds = num;
    this.syncAccountTokenIds(account, info);
  }

  getTokenIdsSize(chain: string, address: string, account?: string): number {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accountTokenInfo(chain, address, account);
    if (!info) return 0;
    return info.expectedTokenIds;
  }

  setRecentBlocksSize(num: number, address?: string) {
    if (!address) {
      address = this.wallets.selectedAccountAddress();
    }
    const info = this.accounts[address];
    if (!info) return;
    info.expectedRecentBlocks = num;
    this.syncTokenBlocks(address, info);
  }

  getRecentBlocksSize(address?: string): number {
    if (!address) {
      address = this.wallets.selectedAccountAddress();
    }
    const info = this.accounts[address];
    if (!info) return 0;
    return info.expectedRecentBlocks;
  }

  syncAccount(account?: string) {
    if (!account) {
      account = this.wallets.selectedAccountAddress();
    }
    this.subscribe(account);
    this.querySyncInfo(account);
    this.queryAccountTokensInfo(account);
    this.queryTokenInfo(environment.current_chain, account);
    this.querySwapMainAccount(account);
    this.queryAccountSwapInfo(account);
  }

  orders(account?: string): OrderSwapInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.orders;
  }

  activeOrders(account?: string): U64 | undefined {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info || !info.swapInfoQueried) return undefined;
    return info.swapInfo?.activeOrders;
  }

  moreOrders(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    return info.moreOrders;
  }

  loadMoreOrders(account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    info.expectedRecentOrders += 10;
    this.syncAccountOrders(account);
  }

  swaps(account?: string): SwapFullInfo[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return [];
    return info.swaps;
  }

  activeSwaps(account?: string): U64 | undefined {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info || !info.swapInfoQueried) return undefined;
    return info.swapInfo?.activeSwaps;
  }

  moreSwaps(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    return info.moreTakerSwaps || info.moreMakerSwaps;
  }

  noMaps(chain: string, account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const maps = info.maps[chain];
    return maps && maps.maps.length === 0 && maps.synced;
  }

  noUnmaps(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const unmaps = info.unmaps;
    return unmaps.unmaps.length === 0 && unmaps.synced;
  }

  noWraps(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const wraps = info.wraps;
    return wraps.wraps.length === 0 && wraps.synced;
  }

  noUnwraps(chain: string, account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const unwraps = info.unwraps[chain];
    return unwraps && unwraps.unwraps.length === 0 && unwraps.synced;
  }

  moreMaps(chain: string, account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const maps = info.maps[chain];
    return maps && maps.more && maps.synced;
  }

  moreUnmaps(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    return info.unmaps.more && info.unmaps.synced;
  }

  moreWraps(account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    return info.wraps.more && info.wraps.synced;
  }

  moreUnwraps(chain: string, account?: string): boolean {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return false;
    const unwraps = info.unwraps[chain];
    return unwraps && unwraps.more && unwraps.synced;
  }

  loadMoreSwaps(account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    info.expectedRecentSwaps += 10;
    this.queryMakerSwaps(account);
    this.queryTakerSwaps(account);
  }

  loadMoreMaps(chain: string, account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    const maps = info.maps[chain];
    if (!maps) return;
    maps.expectedRecentMaps += 10;
    this.queryPendingTokenMapInfos(account, chain);
  }

  loadMoreUnmaps(account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    info.unmaps.expectedRecentUnmaps += 10;
    this.queryTokenUnmapInfos(account);
  }

  loadMoreWraps(account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    info.wraps.expectedRecentWraps += 10;
    this.queryTokenWrapInfos(account);
  }

  loadMoreUnwraps(chain: string, account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    const unwraps = info.unwraps[chain];
    if (!unwraps) return;
    unwraps.expectedRecentUnwraps += 10;
    this.queryPendingTokenUnwrapInfos(account, chain);
  }

  addTokenMapInfos(chain: string, account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    if (info.maps[chain]) return;
    info.maps[chain] = new AccountTokenMapInfos();
    this.syncMapInfos(account, false);
  }

  addTokenUnwrapInfos(chain: string, account?: string) {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return;
    if (info.unwraps[chain]) return;
    info.unwraps[chain] = new AccountTokenUnwrapInfos();
    this.syncUnwrapInfos(account, false);
  }

  orderCancelling(account: string, height: U64): boolean {
    const info = this.accounts[account];
    if (!info) return false;
    return info.orderCancelling(height);
  }

  swappingAsMaker(account: string): boolean {
    const info = this.accounts[account];
    if (!info) return false;
    return info.swappingAsMaker();
  }

  searchOrderById(hash: U256) {
    const params: any = {
      by: 'id',
      hash: hash.toHex()
    }
    this.searchOrder(params);
  }

  searchOrderByPair(fromToken: TokenKey, toToken: TokenKey,
    order?: {maker: string, orderHeight: string}, limitBy?: SearchLimitBy, limitValue?: U256) {
    const params: any = {
      by: 'pair',
      from_token: fromToken.toJson(),
      to_token: toToken.toJson()
    }
    if (order) {
      params.maker = order.maker;
      params.order_height = order.orderHeight;
    }
    if (limitBy) params.limit_by = limitBy;
    if (limitValue) params.limit_value = limitValue.toDec();
    this.searchOrder(params);
  }

  makerInfo(maker: string): MakerInfo | undefined {
    return this.makers[maker];
  }

  mainAccountHeadHeight(maker: string, mainAccount: string): U64 | undefined {
    const info = this.makers[maker];
    if (!info) return undefined;
    return info.mainAccountHeadHeight(mainAccount);
  }

  addTaker(address: string, swapInfo: AccountSwapInfo) {
    let info = this.takers[address];
    if (!info) {
      info = new TakerInfo();
      info.account = address;
      info.swapInfo = swapInfo;
      info.ref = 1;
      this.takers[address] = info;
      this.ongoingSync();
    } else {
      info.swapInfo = swapInfo;
      info.ref += 1;
    }
  }

  removeTaker(address: string) {
    const info = this.takers[address];
    if (!info) return;
    info.ref -= 1;
    if (info.ref <= 0) {
      delete this.takers[address];
    }
  }

  txnsLimitRemaining(account: Account): number {
    const remaining = this.wallets.txnsLimitRemaining(account);
    const info = this.accounts[account.address()];
    if (!info) return remaining;
    const reserved = info.pendingSwapInquiries();
    if (reserved >= remaining) return 0;
    return remaining - reserved;
  }

  processPings(account: Account, wallet: Wallet): SwapProcessResult {
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const address = account.address();
    const info = this.accounts[address];
    if (!info) return skipped;

    if (!info.synced || !info.subscribed) return skipped;

    if (info.orders.length === 0) return skipped;
    if (!info.swapInfo) return skipped;
    if (info.swapInfo.limited) return skipped;
    if (info.swapInfo.activeOrders.eq(0)) return skipped;
    const now = this.server.getTimestamp();
    if (info.lastPong + AppHelper.SWAP_PING_PONG_INTERVAL > now) return skipped;
    if (info.swapInfo.pong.plus(AppHelper.SWAP_PING_PONG_INTERVAL).gt(now)) {
      return skipped;
    }
    if (info.swapInfo.pong.gte(info.swapInfo.ping)) return skipped;
    const result = this.pong(account, wallet);
    if (result.returnCode === SwapReturnCode.SUCCESS) {
      info.lastPong = now;
    }
    return result;
  }

  processActiveSwaps(paused: boolean, account: Account, wallet: Wallet): SwapProcessResult {
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const address = account.address();
    const info = this.accounts[address];
    if (!info) return skipped;

    if (!info.synced || !info.subscribed) return skipped;

    const purged = info.purgeActiveSwaps(this.server.getTimestamp());
    for (let swap of purged) {
      this.removeTaker(swap.taker.account);
    }
    if (purged.length > 0) {
      this.accountSwapsSubject.next(address);
    }

    const swapping = info.getMakerSwappingItem();
    if (swapping) {
      return this.processActiveSwap(info, swapping, paused, account, wallet);
    }

    for (let swap of info.activeSwaps) {
      const result = this.processActiveSwap(info, swap, paused, account, wallet);
      if (result.returnCode === SwapReturnCode.SKIPPED) continue;
      return result;
    }
    return skipped;
  }

  processActiveSwap(info: AccountTokensInfo, swap: SwapFullInfo, paused: boolean, account: Account,
    wallet: Wallet): SwapProcessResult {
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const address = account.address();
    const status = swap.swap.status;
    const now = this.server.getTimestamp();

    if (address === swap.swap.maker) {
      let order = info.getOrder(swap.order.orderHeight);
      if (order && (order.cancelSent || order.order.finished())) return skipped;
      if (swap.order.finished()) return skipped;

      if (status === SwapStatus.INQUIRY) {
        if (paused) return skipped;
        if (swap.inquiryAckSent) return skipped;
        if (swap.swap.timeout.lt(now + 80)) return skipped; // timeout = now + 100 seconds
        if (swap.order.timeout.lte(now)) return skipped;
        if (this.takerSwapLimited(swap.swap.taker)) return skipped;

        const ackValue = swap.ackValue();
        if (ackValue === undefined) return skipped;
        if (order && order.order.fungiblePair() && order.order.leftOffer.lt(ackValue)) {
            return skipped;
        }
        if (swap.order.fungiblePair() && swap.order.leftOffer.lt(ackValue)) {
          return skipped;
        }
        if (this.txnsLimitRemaining(account) < 1) {
          return skipped;
        }
        const result = this.swapInquiryAck(swap, account, wallet);
        if (result.returnCode === SwapReturnCode.SUCCESS) {
          swap.inquiryAckSent = true;
        }
        return result;

      } else if (status === SwapStatus.TAKE) {
        if (swap.takeAckSent) return skipped;
        if (swap.swap.timeout.lt(now + 20)) return skipped;
        if (!account.headHeight.plus(1).eq(swap.swap.tradeHeight)) return skipped;
        const result = this.swapTakeAck(swap, account, wallet);
        if (result.returnCode === SwapReturnCode.SUCCESS) {
          swap.takeAckSent = true;
        }
        return result;

      } else {
        return skipped;
      }
    } else if (address === swap.swap.taker) {
      if (status === SwapStatus.INQUIRY_ACK) {
        if (this.makerTxnLimited(swap.swap.maker)) return skipped;
        if (swap.takeSent) return skipped;
        if (swap.swap.timeout.lt(now + 40)) return skipped;
        if (swap.takeNackBlockStatus === TakeNackBlockStatus.INIT) {
          const result = this.deriveTakeNackBlock(swap, account, wallet);
          if (result.returnCode !== SwapReturnCode.SUCCESS) {
            swap.takeNackBlockStatus = TakeNackBlockStatus.ERROR;
            return result;
          }
          swap.takeNackBlockStatus = TakeNackBlockStatus.PENDING;
          swap.takeNackBlock = result.walletOpResult!.block!;
          this.submitTakeNackBlock(swap.swap.maker, address, swap.swap.inquiryHeight,
            swap.takeNackBlock);
          return result;
        }
        else if (swap.takeNackBlockStatus === TakeNackBlockStatus.SUBMITTED) {
          if (swap.takeSent) return skipped;
          const result = this.swapTake(swap, account, wallet);
          if (result.returnCode === SwapReturnCode.SUCCESS) {
            swap.takeSent = true;
          }
          return result;
        }
        else {
          return skipped;
        }
      } else if (status === SwapStatus.TAKE) {
        if (!swap.takeNackBlock) return skipped;
        if (swap.swap.timeout.gt(now)) return skipped;
        if (swap.takeNackSentTime + 5 > now) return skipped;
        this.wallets.blockPublish(swap.takeNackBlock);
        swap.takeNackSentTime = now;
        return skipped;
      } else {
        return skipped;
      }
    } else {
      console.error('processActiveSwap: unexpected swap,', swap);
      return skipped;
    }
  }

  private swapInquiryAck(swap: SwapFullInfo, account: Account, wallet: Wallet): SwapProcessResult {
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const mainAccount = wallet.findAccount({address: swap.order.mainAccount});
    if (!mainAccount) { 
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_MAIN_ACCOUNT_MISS },
        mainAccountError: true,
        mainAccount: swap.order.mainAccount,
      };
    }
    
    if (!mainAccount.headHeight.plus(1).eq(swap.swap.inquiryAckHeight)) return skipped;
    if (!mainAccount.headConfirmed()) return { returnCode: SwapReturnCode.WAITING };
    if (!account.headConfirmed()) return { returnCode: SwapReturnCode.WAITING };


    let value: any = {}
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.TAKE_NACK;
    value.taker = swap.swap.taker;
    value.inquiry_height = swap.swap.inquiryHeight.toDec();
    let extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];

    let ret = this.wallets.generateChangeBlock(account, wallet, '', extensions,
      swap.swap.timeout.toNumber());
    if (ret.errorCode !== WalletErrorCode.SUCCESS) {
      return { returnCode: SwapReturnCode.FAILED, walletOpResult: ret };
    }
    const takeNackBlock = ret.block!;

    const sharePriKey = this.wallets.sharePriKey(mainAccount.headHeight.plus(1),
     mainAccount, wallet);
     if (sharePriKey.length !== 32) {
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_DERIVE_SHARE_PRI_KEY },
        mainAccountError: true,
        mainAccount: swap.order.mainAccount,
      };
     }
     const sharePubkey = this.wallets.sharePubkey(mainAccount.headHeight.plus(1),
       mainAccount, wallet);
     if (sharePubkey.length !== 32) {
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_DERIVE_SHARE_PUB_KEY },
        mainAccountError: true,
        mainAccount: swap.order.mainAccount,
      };
     }

     const share = new U256();
     const error = share.fromShare(sharePriKey, swap.swap.takerShare);
     if (error) {
      return { returnCode: SwapReturnCode.SKIPPED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_DERIVE_SHARE },
        mainAccountError: true,
        mainAccount: swap.order.mainAccount,
      };
     }
     const signature = new U512(takeNackBlock.signature());
     signature.encrypt(share);
     share.bytes = sharePubkey;

    value = {};
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.INQUIRY_ACK;
    value.taker = swap.swap.taker;
    value.inquiry_height = swap.swap.inquiryHeight.toDec();
    value.trade_height = takeNackBlock.height().toDec();
    value.share = share.toHex();
    value.signature = signature.toHex();

    extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, mainAccount, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) { 
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: result,
        mainAccountError: true,
        mainAccount: swap.order.mainAccount,
      };  
    } else {
      return { returnCode: SwapReturnCode.SUCCESS,
        walletOpResult: result
      };  
    }
  }

  private swapTakeAck(swap: SwapFullInfo, account: Account, wallet: Wallet): SwapProcessResult {
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const ackValue = swap.ackValue();
    if (ackValue === undefined) {
      return skipped;
    }

    if (swap.order.fungiblePair() && swap.order.leftOffer.lt(ackValue)) {
      return skipped;
    }

    const value: any = {}
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.TAKE_ACK;
    value.taker = swap.swap.taker;
    value.inquiry_height = swap.swap.inquiryHeight.toDec();
    value.take_height = swap.swap.takeHeight.toDec();
    value.value = ackValue.toDec();

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) { 
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: result
      };  
    } else {
      return { returnCode: SwapReturnCode.SUCCESS,
        walletOpResult: result
      };  
    }
  }

  private swapTake(swap: SwapFullInfo, account: Account, wallet: Wallet): SwapProcessResult {
    const value: any = {}
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.TAKE;
    value.inquiry_height = swap.swap.inquiryHeight.toDec();
    value.take_height = swap.swap.takeHeight.toDec();

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) { 
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: result
      };  
    } else {
      return { returnCode: SwapReturnCode.SUCCESS,
        walletOpResult: result
      };  
    }
  }

  private pong(account: Account, wallet: Wallet): SwapProcessResult {
    const value: any = {}
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.PONG;
    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) { 
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: result
      };  
    } else {
      return { returnCode: SwapReturnCode.SUCCESS,
        walletOpResult: result
      };  
    }
  }

  private deriveTakeNackBlock(swap: SwapFullInfo, account: Account, wallet: Wallet): SwapProcessResult{
    const skipped = { returnCode: SwapReturnCode.SKIPPED };
    const makerInfo = this.makers[swap.swap.maker];
    if (!makerInfo) {
      console.log('deriveTakeNackBlock: maker not found, ', swap.swap.maker);
      return skipped;
    }

    if (!makerInfo.synced()) {
      console.log('deriveTakeNackBlock: maker not synced, ', swap.swap.maker);
      return skipped;
    }
    
    if (!makerInfo.head) {
      console.log('deriveTakeNackBlock: maker head is null, ', swap.swap.maker);
      return skipped;
    }

    if (!makerInfo.head.hash.eq(swap.swap.tradePrevious)) {
      return skipped;
    }

    const sharePriKey = this.wallets.sharePriKey(swap.swap.inquiryHeight, account, wallet);
    if (sharePriKey.length !== 32) {
      return { returnCode: SwapReturnCode.FAILED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_DERIVE_SHARE_PRI_KEY }
      };
    }

    const share = new U256();
    const error = share.fromShare(sharePriKey, swap.swap.makerShare);
    if (error) {
      return {
        returnCode: SwapReturnCode.SKIPPED,
        walletOpResult: { errorCode: WalletErrorCode.SWAP_DERIVE_SHARE }
      };
    }
    const signature = new U512(swap.swap.makerSignature);
    signature.decrypt(share);

    const value: any = {}
    value.op = ExtensionTokenOpStr.SWAP;
    value.sub_op = TokenSwapSubOpStr.TAKE_NACK;
    value.taker = swap.swap.taker;
    value.inquiry_height = swap.swap.inquiryHeight.toDec();
    const extensions = [{ type: ExtensionTypeStr.TOKEN, value }];

    const result = this.wallets.generateChangeBlockByPrevious(makerInfo.head.block,
      makerInfo.head.hash, swap.swap.timeout, swap.swap.tradeHeight, signature, extensions);
    if (result.errorCode === WalletErrorCode.SUCCESS) {
      return { returnCode: SwapReturnCode.SUCCESS, walletOpResult: result };
    } else {
      console.log('deriveTakeNackBlock: generate block failed, ', result.errorCode);
      return { returnCode: SwapReturnCode.SKIPPED, walletOpResult: result };
    }
  }

  private takerSwapLimited(account: string): boolean {
    const info = this.takers[account];
    if (!info) return false;
    return info.swapInfo.limited;
  }

  private makerSwapLimited(account: string): boolean {
    const info = this.makers[account];
    if (!info) return false;
    return info.swapInfo.limited;
  }

  private makerTxnLimited(account: string): boolean {
    const info = this.makers[account];
    if (!info) return false;
    return info.txnLimited(this.server.getTimestamp());
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
      const synced = info.subscribed && info.swapMainAccountQueried && info.swapInfoQueried;
      if (!force) {
        if (info.nextSyncAt > now) continue;
        if (info.lastSyncAt > now - 15000 && synced) {
          info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
          continue;
        }
      }

      this.subscribe(address);
      this.querySyncInfo(address);
      this.queryAccountTokensInfo(address);
      this.queryTokenInfo(environment.current_chain, address);
      this.queryAccountSwapInfo(address);
      this.querySwapMainAccount(address);
      this.queryAccountActiveSwaps(address);
      this.syncAccountOrders(address);
      this.queryMakerSwaps(address);
      this.queryTakerSwaps(address);

      info.lastSyncAt = now;
      if (synced) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } else {
        info.nextSyncAt = now + 10000;
      }
    }

    this.purgeMakers();
    for (let address in this.makers) {
      let info = this.makers[address];
      const synced = info.swapInfoQueried && info.headQueried;
      if (!force) {
        if (info.nextSyncAt > now) continue;
        if (info.lastSyncAt > now - 15000 && synced) {
          info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
          continue;
        }
      }

      this.queryAccountSwapInfo(address);
      this.subscribeTopicAccountSwapInfo(address);
      this.queryAccountHead(address);
      this.subscribeTopicAccountHead(address);

      for (let order of info.orders) {
        this.queryOrderInfo(address, order.order.orderHeight);
        this.subscribeTopicOrderById(order.order.hash);
      }

      for (let account in info.mainAccounts) {
        this.queryAccountHead(account);
        this.subscribeTopicAccountHead(account);
      }

      info.lastSyncAt = now;
      if (synced) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } else {
        info.nextSyncAt = now + 10000;
      }
    }

    for (let address in this.takers) {
      let info = this.takers[address];
      if (info.nextSyncAt > now && !force) continue;
      this.subscribeTopicAccountSwapInfo(address);

      info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
    }

    for (let info of this.tokenIdOwners) {
      const synced = !!info.owner;
      if (!force) {
        if (info.nextSyncAt > now) continue;
        if (info.lastSyncAt > now - 15000 && synced) {
          info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
          continue;
        }
      }

      this.queryTokenIdOwner(info.address, info.tokenId, info.chain);
      this.subscribeTopicTokenIdOwner(info);
      info.lastSyncAt = now;
      if (synced) {
        info.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } else {
        info.nextSyncAt = now + 10000;
      }
    }

    for (let address in this.accounts) {
      this.syncMapInfos(address, force);
      this.syncUnmapInfos(address, force);
      this.syncWrapInfos(address, force);
      this.syncUnwrapInfos(address, force);
    }

  }

  private ongoingUpateSwapData() {
    this.updateMakerStatus();
    this.purgeAccountSwapInquiries();
  }

  private syncMapInfos(address: string, force?: boolean) {
    const info = this.accounts[address];
    if (!info) return;
    const now = window.performance.now();
    for (let chain in info.maps) {
      const map = info.maps[chain];
      if (!force) {
        if (map.nextSyncAt > now) continue;
        if (map.lastSyncAt > now - 15000 && map.synced) {
          map.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
          continue;
        }
      }

      this.queryPendingTokenMapInfos(address, chain);
      map.lastSyncAt = now;
      if (map.synced) {
        map.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } else {
        map.nextSyncAt = now + 10000;
      }
    }
  }

  private syncUnmapInfos(address: string, force?: boolean) {
    const info = this.accounts[address];
    if (!info) return;
    const now = window.performance.now();
    if (!force) {
      if (info.unmaps.nextSyncAt > now) return;
      if (info.unmaps.lastSyncAt > now - 15000 && info.unmaps.synced) {
        info.unmaps.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
        return;
      }
    }

    this.queryTokenUnmapInfos(address);
    info.unmaps.lastSyncAt = now;
    if (info.unmaps.synced) {
      info.unmaps.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
    } else {
      info.unmaps.nextSyncAt = now + 10000;
    }
  }

  private syncWrapInfos(address: string, force?: boolean) {
    const info = this.accounts[address];
    if (!info) return;
    const now = window.performance.now();
    if (!force) {
      if (info.wraps.nextSyncAt > now) return;
      if (info.wraps.lastSyncAt > now - 15000 && info.wraps.synced) {
        info.wraps.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
        return;
      }
    }

    this.queryTokenWrapInfos(address);
    info.wraps.lastSyncAt = now;
    if (info.wraps.synced) {
      info.wraps.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
    } else {
      info.wraps.nextSyncAt = now + 10000;
    }
  }

  private syncUnwrapInfos(address: string, force?: boolean) {
    const info = this.accounts[address];
    if (!info) return;
    const now = window.performance.now();
    for (let chain in info.unwraps) {
      const unwrap = info.unwraps[chain];
      if (!force) {
        if (unwrap.nextSyncAt > now) continue;
        if (unwrap.lastSyncAt > now - 15000 && unwrap.synced) {
          unwrap.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
          continue;
        }
      }

      this.queryPendingTokenUnwrapInfos(address, chain);
      unwrap.lastSyncAt = now;
      if (unwrap.synced) {
        unwrap.nextSyncAt = now + 150000 + Math.random() * 300 * 1000;
      } else {
        unwrap.nextSyncAt = now + 10000;
      }
    }
  }

  private updateMakerStatus() {
    const now = this.server.getTimestamp();
    let notify = false;
    for (let maker in this.makers) {
      const info = this.makers[maker];
      const update = info.updateOrderStatus(now);
      if (update) {
        notify = true;
      }
    }
    if (notify) {
      this.makersSubject.next();
    }
  }

  private purgeAccountSwapInquiries() {
    for (let account in this.accounts) {
      const info = this.accounts[account];
      info.purgeSwapInquiries(this.server.getTimestamp());
    }
  }

  private submitTakeNackBlock(maker: string, taker: string, inquiryHeight: U64, block: Block) {
    const message: any = {
      action: 'submit_take_nack_block',
      service: this.SERVICE,
      maker,
      taker,
      inquiry_height: inquiryHeight.toDec(),
      block: block.json()
    };
    this.server.send(message);
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

  private subscribeTopicAccountHead(account: string) {
    const data = new U256();
    data.fromAccountAddress(account);
    const topic = AppHelper.calcTopic(AppTopicType.ACCOUNT_HEAD, data);
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      topic: 'account_head',
      account,
      filters: [{key:'topic', value:topic.toHex()}],
    };
    this.server.send(message);
  }

  private subscribeTopicTokenIdOwner(info: TokenIdOwnerInfo) {
    const chain = info.chain;
    const address = info.address;
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error || !ret.raw) {
      console.error(`subscribeTopicTokenIdOwner: failed to convert address to raw`, chain, address);
      return;
    }
    const address_raw = ret.raw.toHex();

    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      topic: 'token_id_owner',
      chain,
      address,
      address_raw,
      token_id: info.tokenId,
      filters: [{key:'topic', value:info.topic()}],
    };
    this.server.send(message);
  }

  private subscribeTopicAccountSwapInfo(account: string) {
    const data = new U256();
    data.fromAccountAddress(account);
    const topic = AppHelper.calcTopic(AppTopicType.ACCOUNT_SWAP_INFO, data);
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      topic: 'account_swap_info',
      account,
      filters: [{key:'topic', value:topic.toHex()}],
    };
    this.server.send(message);
  }

  private subscribeTopicOrderById(hash: U256) {
    const topic = AppHelper.calcTopic(AppTopicType.ORDER_ID, hash);
    const message: any = {
      action: 'service_subscribe',
      service: this.SERVICE,
      topic: 'order_by_id',
      hash: hash.toHex(),
      filters: [{key:'topic', value:topic.toHex()}],
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
        case 'account_active_swaps':
          this.processAccountActiveSwapsQueryAck(message);
          break;
        case 'account_head':
          this.processAccountHead(message);
          break;
        case 'account_orders':
          this.processAccountOrdersAck(message);
          break;
        case 'account_swap_info':
          this.processAccountSwapInfo(message);
          break;
        case 'account_synchronize':
          this.processAccountSyncAck(message);
          break;
        case 'account_tokens_info':
          this.processAccountTokensInfoQueryAck(message);
          break;
        case 'account_token_ids':
          this.processAccountTokenIdsQueryAck(message);
          break;
        case 'account_token_link':
          this.processAccountTokenLinkQueryAck(message);
          break;
        case 'maker_swaps':
          this.processMakerSwapsQueryAck(message);
          break;
        case 'next_account_token_links':
          this.processAccountTokenLinksQueryAck(message, false);
          break;
        case 'next_token_blocks':
          this.processTokenBlocksQueryAck(message, false);
          break;
        case 'order_info':
          this.processOrderInfoQueryAck(message);
          break;
        case 'order_swaps':
          this.processOrderSwapsAck(message);
          break;
        case 'pending_token_map_infos':
          this.processPendingTokenMapInfosAck(message);
          break;
        case 'pending_token_unwrap_infos':
          this.processPendingTokenUnwrapInfosAck(message);
          break;
        case 'previous_account_token_links':
          this.processAccountTokenLinksQueryAck(message, true);
          break;
        case 'previous_token_blocks':
          this.processTokenBlocksQueryAck(message, true);
          break;
        case 'swap_main_account':
          this.processSwapMainAccountAck(message);
          break;
        case 'taker_swaps':
          this.processTakerSwapsQueryAck(message);
          break;
        case 'token_block':
          this.processTokenBlockQueryAck(message);
          break;
        case 'token_info':
          this.processTokenInfoQueryAck(message);
          break;
        case 'token_map_infos':
          this.processTokenMapInfosAck(message);
          break;
        case 'token_unmap_infos':
          this.processTokenUnmapInfosAck(message);
          break;
        case 'token_wrap_infos':
          this.processTokenWrapInfosAck(message);
          break;
        case 'token_unwrap_infos':
          this.processTokenUnwrapInfosAck(message);
          break;
        case 'token_receivables':
          this.processTokenReceivablesQueryAck(message);
          break;
        case 'token_receivables_summary':
            this.processTokenReceivablesSummaryQueryAck(message);
            break;  
        case 'token_max_id':
          this.processTokenMaxIdQueryAck(message);
          break;
        case 'token_id_info':
          this.processTokenIdInfoQueryAck(message);
          break;
        case 'token_id_owner':
          this.processTokenIdOwner(message);
          break;
        case 'search_orders':
          this.processSearchOrdersAck(message);
          break;
        case 'submit_take_nack_block':
          this.processSubmitTakeNackBlockAck(message);
          break;
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
        case 'account_head':
          this.processAccountHead(message);
          break;
        case 'account_synchronize':
          this.processAccountSyncNotify(message);
          break;
        case 'account_swap_info':
          this.processAccountSwapInfo(message);
          break;
        case 'account_tokens_info':
          this.processAccountTokensInfoNotify(message);
          break;
        case 'order_info':
          this.processOrderInfo(message);
          break;
        case 'pending_token_map_info':
          this.processPendingTokenMapInfoNotify(message);
          break;
        case 'pending_token_unwrap_info':
          this.processPendingTokenUnwrapInfoNotify(message);
          break;
        case 'swap_info':
          this.processSwapInfoNotify(message);
          break;
        case 'swap_main_account':
          this.processSwapMainAccountNotify(message);
          break;
        case 'token_info':
          this.processTokenInfoNotify(message);
          break;
        case 'token_receivable':
          this.processTokenReceivableNotify(message);
          break;
        case 'token_received':
          this.processTokenReceivedNotify(message);
          break;
        case 'token_id_info':
          this.processTokenIdInfoNotify(message);
          break;
        case 'token_id_owner':
          this.processTokenIdOwner(message);
          break;
        case 'token_id_transfer':
          this.processTokenIdTransferNotify(message);
          break;
        case 'token_map_info':
          this.processTokenMapInfoNotify(message);
          break;
        case 'token_unmap_info':
          this.processTokenUnmapInfoNotify(message);
          break;
        case 'token_wrap_info':
          this.processTokenWrapInfoNotify(message);
          break;
        case 'token_unwrap_info':
          this.processTokenUnwrapInfoNotify(message);
          break;
        case 'take_nack_block_submitted':
          this.processTakeNackBlockSubmittedNotify(message);
          break;
        default:
          break;
      }
    }
  }

  private processValidatorMessage(message: any) {
    if (!message.service || message.service !== this.VALIDATOR_SERVICE) return;
    if (message.ack) {
      switch (message.ack) {
        case 'token_symbol':
          this.processTokenSymbolAck(message);
          break;
        case 'token_name':
          this.processTokenNameAck(message);
          break;
        case 'token_type':
          this.processTokenTypeAck(message);
          break;
        case 'token_decimals':
          this.processTokenDecimalsAck(message);
          break;
        case 'token_wrapped':
          this.processTokenWrappedAck(message);
          break;
        case 'transaction_timestamp':
          this.processTxTimestamp(message);
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

  private processAccountActiveSwapsQueryAck(message: any) {
    if (message.error || !message.swaps) return;
    for (let i of message.swaps) {
      let swap : SwapFullInfo | null = new SwapFullInfo();
      const error = swap.fromJson(i);
      if (error) continue;
      const taker = swap.swap.taker;
      const maker = swap.order.maker.account;
      let info = this.accounts[taker];
      if (info) {
        this.updateAccountActiveSwap(info, swap);
        swap = null;
      }
      info = this.accounts[maker];
      if (info) {
        if (!swap) {
          swap = new SwapFullInfo();
          swap.fromJson(i);
        }
        this.updateAccountActiveSwap(info, swap);
      }
    }
  }

  private processAccountHead(message: any) {
    if (!message.account
      || (message.error && message.error !== 'The account does not exist') ) {
        return;
      }

    const head = new AccountHead();
    if (!message.error) {
      const error = head.fromJson(message);
      if (error) return;
    }

    let notify = false;
    const info = this.makers[message.account];
    if (info) {
      info.head = head;
      info.headQueried = true; 
      notify = true;
    }

    for (let maker in this.makers) {
      const info = this.makers[maker];
      if (!info.hasMainAccount(message.account)) continue;
      info.mainAccounts[message.account] = head;
      notify = true;
    }

    if (notify) {
      this.makersSubject.next();
    }
  }

  private processAccountOrdersAck(message: any) {
    if (!message.account || message.error || !message.more) return;
    const info = this.accounts[message.account];
    if (!info) return;
    info.moreOrders = message.more === 'true';
    if (!message.orders) return;

    let sort = false;
    let inserted = false;
    let minOrderHeight = U64.max();
    for (let i of message.orders) {
      const order = new OrderInfo();
      const error = order.fromJson(i);
      if (error) continue;
      inserted = info.updateOrder(order, false);
      this.orderInfoSubject.next(order);
      if (inserted && OrderSwapInfo.DEFAULT_EXPECTED_RECENT_SWAPS > 0) {
        this.queryOrderSwaps(message.account, order.orderHeight)
      }
      sort = true;
      if (order.orderHeight.lt(minOrderHeight)) {
        minOrderHeight = order.orderHeight;
      }
    }

    if (sort) info.sortOrders();

    if (!inserted /* The last order exists */ || minOrderHeight.eq(info.minOrderHeight)) {
      if (!info.moreOrders || info.orders.length >= info.expectedRecentOrders
        || info.minOrderHeight.eq(0)) {
        return;
      }
      this.queryAccountOrders(message.account, info.minOrderHeight.minus(1));
    } else {
      if (minOrderHeight.gt(0)) {
        this.queryAccountOrders(message.account, minOrderHeight.minus(1));
      }
    }
  }

  private processAccountSwapInfo(message: any) {
    if (!message.account) return;
    const swapInfo = new AccountSwapInfo();
    swapInfo.account = message.account;

    if (message.error) {
      if (message.error !== 'missing') {
        return;
      }
    } else {
      const error = swapInfo.fromJson(message);
      if (error) return;  
    }

    const info = this.accounts[message.account];
    if (info) {
      info.swapInfoQueried = true;
      info.swapInfo = swapInfo;
    }

    const makerInfo = this.makers[message.account];
    if (makerInfo) {
      makerInfo.swapInfoQueried = true;
      makerInfo.swapInfo = swapInfo;
      makerInfo.updateOrderStatus(this.server.getTimestamp());
      this.makersSubject.next();
    }

    const takerInfo = this.takers[message.account];
    if (takerInfo) {
      takerInfo.swapInfo = swapInfo;
    }

    this.accountSwapInfoSubject.next(swapInfo);
  }

  private processAccountSyncAck(message: any) {
    if (!message.request_id || message.error || !message.synchronized) return;

    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);

    const info = this.accounts[address];
    if (!info) return;
    info.synced = message.synchronized === 'true';
    this.accountSyncedSubject.next({ account: address, synced: info.synced });
  }

  private processAccountTokensInfoQueryAck(message: any) {
    if (!message.request_id) return;
    const id = message.request_id;
    if (!id.startsWith('account:')) return;
    const address = id.substring(8);
    this.queryTokenReceivablesSummary(address);
    if (!message.error) {
      this.updateAccountTokensInfo(address, message);
    }
  }

  private processAccountTokenIdsQueryAck(message: any)
  {
    if (message.error || !message.account || !message.chain
        || !message.address_raw) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const chain = message.chain;
    const addressRaw = new U256(message.address_raw, 16);
    const token = info.getToken(chain, addressRaw);
    if (!token) return;

    if (!message.ids) {
      if (token.tokenIds.length < token.expectedTokenIds
        && !token.balance.eq(token.tokenIds.length)) {
        token.tokenIds = [];
        this.queryAccountTokensInfo(account);
      }
      return;
    }

    for (let i of message.ids) {
      const id = new AccountTokenId();
      const error = id.fromJson(i);
      if (error) return;
      token.addTokenId(id);
    }

    this.syncAccountTokenIds(account, token);
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

  private processOrderInfo(message: any) {
    if (message.error) return;
    const order = new OrderInfo();
    const error = order.fromJson(message);
    if (error) return;
    const account = order.maker.account;
    const info = this.accounts[account];
    if (info) {
      info.updateOrder(order);
    }

    const maker = order.maker.account;
    const makerInfo = this.makers[maker];
    if (makerInfo) {
      const newMainAccount = !makerInfo.hasMainAccount(order.mainAccount);
      makerInfo.updateOrder(order, this.server.getTimestamp());
      if (newMainAccount) {
        this.queryAccountHead(order.mainAccount);
        this.subscribeTopicAccountHead(order.mainAccount);
      }
    }

    this.orderInfoSubject.next(order);
  }

  private processPendingTokenMapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const maps = info.maps[chain];
    if (!maps) return;

    const map = new MapInfo();
    const error = map.fromJson(message);
    if (error) return;
    map.confirmed = false;

    if (message.rollback === 'true') {
      this.queryPendingTokenMapInfos(account, chain);
    } else {
      maps.insert(map);
    }
  }

  processPendingTokenUnwrapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.from_chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.from_chain_id);
    }

    const unwraps = info.unwraps[chain];
    if (!unwraps) return;

    const unwrap = new UnwrapInfo();
    const error = unwrap.fromJson(message);
    if (error) return;
    unwrap.confirmed = false;

    if (message.rollback === 'true') {
      this.queryPendingTokenUnwrapInfos(account, chain);
    } else {
      unwraps.insert(unwrap);
    }
  }

  private processOrderInfoQueryAck(message: any) {
    if (message.error || !message.order) return;
    this.processOrderInfo(message.order);
  }
  
  private processOrderSwapsAck(message: any){
    if (!message.maker || message.error || !message.more || !message.height) return;
    const account = message.maker;
    const info = this.accounts[account];
    if (!info) return;
    const order = info.getOrder(message.height);
    if (!order) return;

    order.moreSwaps = message.more === 'true';
    if (!order.moreSwaps && order.finalSync) order.synced = true;
    if (!message.swaps) return;

    let sort = false;
    let existing = false;
    let minTradeHeight = U64.max();
    for (let i of message.swap) {
      const swap = new SwapInfo();
      const error = swap.fromJson(i);
      if (error) continue;
      existing = order.updateSwap(swap, false);
      sort = true;
      if (swap.tradeHeight.lt(minTradeHeight)) {
        minTradeHeight = swap.tradeHeight;
      }
    }

    if (sort) order.sortSwaps();

    if (existing || minTradeHeight.eq(order.minTradeHeigt())) {
      if (!order.moreSwaps || order.swaps.length >= order.expectedRecentSwaps
        || order.minTradeHeigt().eq(0)) {
        if (order.finalSync) order.synced = true;
        return;
      }
      this.queryOrderSwaps(account, order.order.orderHeight, order.minTradeHeigt().minus(1));
    } else {
      if (minTradeHeight.gt(0)) {
        this.queryOrderSwaps(account, order.order.orderHeight, minTradeHeight.minus(1));
      }
    }

  }

  private processMakerSwapsQueryAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    info.moreMakerSwaps = message.more === 'true';
    if (!message.swaps) return;

    let sort = false;
    let inserted = false;
    let minHeight = U64.max();
    for (let i of message.swaps) {
      const swap = new SwapFullInfo();
      const error = swap.fromJson(i);
      if (error) continue;
      inserted = info.updateSwap(swap, false);
      if (inserted) sort = true;
      if (swap.swap.tradeHeight.lt(minHeight)) {
        minHeight = swap.swap.tradeHeight;
      }
    }

    if (sort) {
      info.sortMakerSwaps();
    }
    info.mergeSwaps();

    if (!inserted || minHeight.eq(info.minMakerSwapHeight())) {
      if (!info.moreMakerSwaps || info.makerSwaps.length >= info.expectedRecentSwaps
        || info.minMakerSwapHeight().eq(0)) {
        return;
      }
      this.queryMakerSwaps(account, info.minMakerSwapHeight().minus(1),
        info.expectedRecentSwaps - info.makerSwaps.length);
    } else {
      if (minHeight.gt(0)) {
        this.queryMakerSwaps(account, minHeight.minus(1));
      }
    }
    this.accountSwapsSubject.next(account);
  }

  private processPendingTokenMapInfosAck(message: any) {
    if (message.error || !message.account) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const maps = info.maps[chain];
    if (!maps) return;
    maps.purgePendings();
    
    if (message.maps) {
      for (let i of message.maps) {
        const map = new MapInfo();
        const error = map.fromJson(i);
        if (error) return;
        map.confirmed = false;
        maps.insert(map);
      }
    }

    this.queryTokenMapInfos(account, chain, maps.confirmedTail);
  }

  private processPendingTokenUnwrapInfosAck(message: any) {
    if (message.error || !message.account) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const unwraps = info.unwraps[chain];
    if (!unwraps) return;
    unwraps.purgePendings();
    
    if (message.unwraps) {
      for (let i of message.unwraps) {
        const unwrap = new UnwrapInfo();
        const error = unwrap.fromJson(i);
        if (error) return;
        unwrap.confirmed = false;
        unwraps.insert(unwrap);
      }
    }

    this.queryTokenUnwrapInfos(account, chain, unwraps.confirmedTail);
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
    if (message.error || !message.token_blocks || !message.account) return;
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

  private processSwapMainAccountAck(message: any) {
    if (!message.account) return;
    const info = this.accounts[message.account];
    if (!info) return;

    if (message.error) {
      if (message.error !== 'missing') {
        return;
      }
      info.swapMainAccountQueried = true;
      info.swapMainAccount = '';
    } else {
      if (!message.main_account) return;
      info.swapMainAccountQueried = true;
      info.swapMainAccount = message.main_account;
    }
  }


  private processTakerSwapsQueryAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    info.moreTakerSwaps = message.more === 'true';
    if (!message.swaps) return;

    let sort = false;
    let inserted = false;
    let minHeight = U64.max();
    for (let i of message.swaps) {
      const swap = new SwapFullInfo();
      const error = swap.fromJson(i);
      if (error) continue;
      inserted = info.updateSwap(swap, false);
      if (inserted) sort = true;
      if (swap.swap.inquiryHeight.lt(minHeight)) {
        minHeight = swap.swap.inquiryHeight;
      }
    }

    if (sort) {
      info.sortTakerSwaps();
    }
    info.mergeSwaps();
    this.accountSwapsSubject.next(account);

    if (!inserted || minHeight.eq(info.minTakerSwapHeight())) {
      if (!info.moreTakerSwaps || info.takerSwaps.length >= info.expectedRecentSwaps
        || info.minTakerSwapHeight().eq(0)) {
        return;
      }
      this.queryTakerSwaps(account, info.minTakerSwapHeight().minus(1),
        info.expectedRecentSwaps - info.takerSwaps.length);
    } else {
      if (minHeight.gt(0)) {
        this.queryTakerSwaps(account, minHeight.minus(1));
      }
    }
  }

  private processTokenBlockQueryAck(message: any) {
    if (message.error || !message.account) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;

    const height = new U64(message.height);
    const link = new TokenBlockLink();
    let error = link.fromJson(message);
    if (error) return;

    const tokenBlock = new TokenBlock();
    error = tokenBlock.fromJson(message);
    if (error) return;
    info.tokenBlockLinks.pushFront(link);
    this.putTokenBlock(account, height, tokenBlock);
    this.syncTokenBlocks(account, info);
  }

  private processTokenInfoQueryAck(message: any) {
    if (!message.chain || !message.address_raw) return;
    const chain = message.chain;
    let address = message.address;
    if (!address) {
      const ret = ChainHelper.rawToAddress(chain, message.address_raw);
      if (ret.error) {
        console.error(`processTokenInfoQueryAck: convert raw to address failed, chain: ${chain}, raw: ${message.address_raw}`);
        return;
      }
      address = ret.address;
    }

    if (message.error) {
      if (message.error === "The token doesn't exist") {
        if (!this.isRaicoin(message.chain)) return;
        const info = this.accounts[address];
        if (!info) return;
        info.issuerInfo.queried = true;
        this.issuerSubject.next({account: address, created: info.issuerInfo.created});
        this.tokenInfoSubject.next({chain, address, existing: false});
      }
      return;
    }

    const tokenInfo = new TokenInfo();
    let error = tokenInfo.fromJson(message);
    if (error) return;
    tokenInfo.symbol = this.tokenSymbols[tokenInfo.chain]?.[tokenInfo.address] || tokenInfo.symbol;
    tokenInfo.name = this.tokenNames[tokenInfo.chain]?.[tokenInfo.address] || tokenInfo.name;
    this.putTokenInfo(tokenInfo.chain, tokenInfo.addressRaw, tokenInfo);

    if (this.isRaicoin(tokenInfo.chain)) {
      const info = this.accounts[address];
      if (info) {
        if (tokenInfo.type === TokenType._721) {
          this.queryTokenMaxId(address);
        }
        info.issuerInfo.queried = true;
        info.issuerInfo.created = true;
        this.issuerSubject.next({account: address, created: info.issuerInfo.created});  
      }
    }
    this.tokenInfoSubject.next({chain, address, existing: true, info: tokenInfo});
  }

  private processTokenMapInfosAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const maps = info.maps[chain];
    if (!maps) return;
    
    let previous: MapInfo | undefined;
    let inserted = false;
    if (message.maps) {
      for (let i of message.maps) {
        const map = new MapInfo();
        const error = map.fromJson(i);
        if (error) return;
        map.confirmed = true;
        inserted = maps.insert(map);
        previous = map;
      }
    }

    maps.more = message.more === 'true';
    if (!maps.more) {
      maps.synced = true;
      return;
    }

    if (inserted && !previous?.eq(maps.confirmedTail!)) {
      this.queryTokenMapInfos(account, chain, previous);
    } else if (maps.maps.length < maps.expectedRecentMaps) {
      this.queryTokenMapInfos(account, chain, maps.confirmedTail);
    } else {
      maps.synced = true;
    }
  }

  private processTokenUnmapInfosAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const unmaps = info.unmaps;

    let last: UnmapInfo | undefined;
    let existing = false;
    if (message.unmaps) {
      for (let i of message.unmaps) {
        const unmap = new UnmapInfo();
        const error = unmap.fromJson(i);
        if (error) return;
        existing = unmaps.insert(unmap);
        last = unmap;
      }
    }

    unmaps.more = message.more === 'true';
    if (!unmaps.more || !last) {
      unmaps.synced = true;
      return;
    }
    const tail = unmaps.tail();
    if (!tail) {
      console.error(`TokenService::processTokenUnmapInfosAck: unexpected tail=`, tail);
      return;
    }

    const pendingTail = unmaps.pendingTail();
    if ((last.height > tail.height && !existing) // gap
      || (pendingTail && pendingTail.height < last.height)) {
      this.queryTokenUnmapInfos(account, last.height - 1);
    } else if(unmaps.size() < unmaps.expectedRecentUnmaps) {
      this.queryTokenUnmapInfos(account, tail.height - 1);
    } else {
      unmaps.synced = true;
    }
  }

  private processTokenWrapInfosAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const wraps = info.wraps;

    let last: WrapInfo | undefined;
    let existing = false;
    if (message.wraps) {
      for (let i of message.wraps) {
        const wrap = new WrapInfo();
        const error = wrap.fromJson(i);
        if (error) return;
        existing = wraps.insert(wrap);
        last = wrap;
      }
    }

    wraps.more = message.more === 'true';
    if (!wraps.more || !last) {
      wraps.synced = true;
      return;
    }
    const tail = wraps.tail();
    if (!tail) {
      console.error(`TokenService::processTokenWrapInfosAck: unexpected tail=`, tail);
      return;
    }

    const pendingTail = wraps.pendingTail();
    if ((last.height > tail.height && !existing) // gap
      || (pendingTail && pendingTail.height < last.height)) {
      this.queryTokenWrapInfos(account, last.height - 1);
    } else if(wraps.size() < wraps.expectedRecentWraps) {
      this.queryTokenWrapInfos(account, tail.height - 1);
    } else {
      wraps.synced = true;
    }
  }

  private processTokenUnwrapInfosAck(message: any) {
    if (message.error || !message.account || !message.more) return;
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const unwraps = info.unwraps[chain];
    if (!unwraps) return;
    
    let previous: UnwrapInfo | undefined;
    let inserted = false;
    if (message.unwraps) {
      for (let i of message.unwraps) {
        const unwrap = new UnwrapInfo();
        const error = unwrap.fromJson(i);
        if (error) return;
        unwrap.confirmed = true;
        inserted = unwraps.insert(unwrap);
        previous = unwrap;
      }
    }

    unwraps.more = message.more === 'true';
    if (!unwraps.more) {
      unwraps.synced = true;
      return;
    }

    if (inserted && !previous?.eq(unwraps.confirmedTail!)) {
      this.queryTokenUnwrapInfos(account, chain, previous);
    } else if (unwraps.unwraps.length < unwraps.expectedRecentUnwraps) {
      this.queryTokenUnwrapInfos(account, chain, unwraps.confirmedTail);
    } else {
      unwraps.synced = true;
    }
  }

  private processTokenReceivablesQueryAck(message: any) {
    if (message.error || !message.receivables) return;
    for (let r of message.receivables) {
      this.updateReceivable(r);
    }
  }

  private processTokenReceivablesSummaryQueryAck(message: any) {
    if (!message.account || !message.tokens) return;
    const account = message.account;
    const tokens: {chain: string, address_raw: string}[] = [];
    for (let i of message.tokens) {
      let address = i.address;
      if (!address) {
        const ret = ChainHelper.rawToAddress(i.chain, i.address_raw);
        if (ret.error) {
          console.error(`processTokenReceivablesSummaryQueryAck: convert raw to address failed, chain: ${i.chain}, raw: ${i.address_raw}`);
          continue;
        }
        address = ret.address;
      }
      if (this.shouldReceive(account, i.chain, address)) {
        tokens.push({chain: i.chain, address_raw: i.address_raw});
      }
    }
    if (tokens.length === 0) return;
    this.queryTokenReceivables(account, tokens);
  }

  private processAccountSyncNotify(message: any) {
    if (!message.account || !message.synchronized) return;

    const info = this.accounts[message.account];
    if (!info) return;
    info.synced = message.synchronized === 'true';
    this.accountSyncedSubject.next({ account: message.account, synced: info.synced });
  }

  private processSwapInfoNotify(message: any) {
    let swap: SwapFullInfo | null = new SwapFullInfo();
    const error = swap.fromJson(message);
    if (error) {
      console.error(`processSwapInfoNotify: parse swap info failed, message: `, message);
      return;
    }

    const taker = swap.taker.account;
    const maker = swap.order.maker.account;

    if (swap.swap.success()) {
      const info = this.accounts[maker];
      if (info) {
        info.updateOrder(swap.order);
        const order = info.getOrder(swap.order.orderHeight);
        if (order) {
          order.updateSwap(swap.swap);
        }
      }  
    }

    let info = this.accounts[taker];
    if (info) {
      if (info.takerSwapExists(swap)) {
        info.updateSwap(swap);
        info.mergeSwaps();
        this.accountSwapsSubject.next(taker);
        swap = null;
      } else {
        this.queryTakerSwaps(taker);
      }

      if (!swap) {
        swap = new SwapFullInfo();
        swap.fromJson(message);
      }
      this.updateAccountActiveSwap(info, swap);
      swap = null;
    }

    info = this.accounts[maker];
    if (info) {
      if (!swap) {
        swap = new SwapFullInfo();
        swap.fromJson(message);
      }
      if (info.makerSwapExists(swap)) {
        info.updateSwap(swap);
        info.mergeSwaps();
        this.accountSwapsSubject.next(maker);
        swap = null;
      } else {
        this.queryMakerSwaps(maker);
      }

      if (!swap) {
        swap = new SwapFullInfo();
        swap.fromJson(message);
      }
      this.updateAccountActiveSwap(info, swap);
      swap = null;
    }

    if (!swap) {
      swap = new SwapFullInfo();
      swap.fromJson(message);
    }
    this.swapSubject.next(swap);
  }

  private processSwapMainAccountNotify(message: any) {
    const account = message.account;
    const mainAccount = message.main_account;
    const info = this.accounts[account];
    if (!info) return;
    info.swapMainAccount = mainAccount;
  }

  private processTokenInfoNotify(message: any) {
    const tokenInfo = new TokenInfo();
    let error = tokenInfo.fromJson(message);
    if (error) return;
    tokenInfo.symbol = this.tokenSymbols[tokenInfo.chain]?.[tokenInfo.address] || tokenInfo.symbol;
    tokenInfo.name = this.tokenNames[tokenInfo.chain]?.[tokenInfo.address] || tokenInfo.name;
    this.putTokenInfo(tokenInfo.chain, tokenInfo.addressRaw, tokenInfo);

    const address = tokenInfo.address;
    if (this.isRaicoin(tokenInfo.chain)) {
      const info = this.accounts[address];
      if (!info) return;
      if (tokenInfo.type === TokenType._721) {
        this.queryTokenMaxId(address);
      }
      info.issuerInfo.queried = true;
      info.issuerInfo.created = true;
      this.issuerSubject.next({account: address, created: info.issuerInfo.created});
    }
    this.tokenInfoSubject.next({chain: tokenInfo.chain, address: address,
                                existing: true, info: tokenInfo});
  }

  private processAccountTokensInfoNotify(message: any) {
    this.updateAccountTokensInfo(message.account, message);
    this.queryTokenReceivablesSummary(message.account);
  }

  private processTokenMaxIdQueryAck(message: any) {
    if (!message.chain || !message.address_raw) return;
    if (message.chain !== environment.current_chain) return;
    let address = message.address;
    if (!address) {
      const ret = ChainHelper.rawToAddress(message.chain, message.address_raw);
      if (ret.error) {
        console.error(`processTokenMaxIdQueryAck: convert raw to address failed, chain: ${message.chain}, raw: ${message.address_raw}`);
        return;
      }
      address = ret.address;
    }

    if (message.error) {
      if (message.error !== 'missing') return;
      this.updateMaxTokenId(address);
    } else {
      try {
        const id = new U256(message.token_id);
        this.updateMaxTokenId(address, id);
      }
      catch (e) {
        console.log(`TokenService.processTokenMaxIdQueryAck: failed to parse message=`, message);
      }
    }
  }

  private processTokenIdInfoQueryAck(message: any)
  {
    if (!message.chain || !message.address_raw || !message.token_id) return;
    const chain = message.chain;
    let address = message.address;
    if (!address) {
      const ret = ChainHelper.rawToAddress(message.chain, message.address_raw);
      if (ret.error) {
        console.error(`processTokenIdInfoQueryAck: convert raw to address failed, chain: ${message.chain}, raw: ${message.address_raw}`);
        return;
      }
      address = ret.address;
    }

    try {
      const id = new U256(message.token_id);
      if (message.error) {
        if (message.error === 'missing') {
          this.tokenIdSubject.next({ chain, address, id, existing: false });
        }
      } else {
        if (!message.burned) return;
        const maxId = this.maxTokenIds[address];
        if (maxId && maxId.valid) {
          this.updateMaxTokenId(address, id);
        }
        this.tokenIdSubject.next({ chain, address, id, existing: message.burned !== 'true' });
      }
    }
    catch (e) {
      console.log(`TokenService.processTokenIdInfoQueryAck: failed to parse message=`, message);
    }
  }

  private processTokenIdOwner(message: any) {
    if (message.error) return;
    const info = new TokenIdOwnerInfo();
    const error = info.fromJson(message);
    if (error) return;

    const index = this.tokenIdOwners.findIndex(x => x.eq(info));
    if (index === -1) return;
    info.copyLocalData(this.tokenIdOwners[index]);
    this.tokenIdOwners[index] = info;
  }

  private processSearchOrdersAck(message: any) {  
    if (!message.by) return;
    const by = message.by;
    let hash: U256;
    let fromToken: TokenKey;
    let toToken: TokenKey;
    let limitBy: SearchLimitBy | undefined;
    let limitValue: U256 | undefined;
    const orders: OrderInfo[] = [];

    if (message.orders) {
      for (const order of message.orders) {
        const info = new OrderInfo();
        const error = info.fromJson(order);
        if (error) return;
        orders.push(info);
      }
    }

    if (by === 'id') {
      if (!message.hash) return;
      hash = new U256(message.hash, 16);
      this.searchOrderSubject.next({by, hash, orders});
    } else if (by === 'pair') {
      if (!message.from_token || !message.to_token) return;
      fromToken = new TokenKey();
      let error = fromToken.fromJson(message.from_token);
      if (error) return;
      toToken = new TokenKey();
      error = toToken.fromJson(message.to_token);
      if (error) return;
      if (message.limit_by) {
        limitBy = message.limit_by;
      }
      if (message.limit_value) {
        limitValue = new U256(message.limit_value);
      }
      const more = message.more === 'true';
      this.searchOrderSubject.next({by, fromToken, toToken, limitBy, limitValue, more, orders});
    } else {
      return;
    }
  }

  private processSubmitTakeNackBlockAck(message: any) {
    if (!message.taker || !message.inquiry_height) return;
    const info = this.accounts[message.taker];
    if (!info) return;

    const swap = info.getActiveSwap(message.taker, new U64(message.inquiry_height));
    if (!swap) return;
    if (swap.takeNackBlockStatus !== TakeNackBlockStatus.PENDING) return;
    if (message.error) {
      swap.takeNackBlockStatus = TakeNackBlockStatus.ERROR;
      return;
    }

    if (message.status === 'submitted') {
      swap.takeNackBlockStatus = TakeNackBlockStatus.SUBMITTED;
    }
  }

  private processTokenReceivableNotify(message: any) {
    this.updateReceivable(message);
  }

  private processTokenReceivedNotify(message: any) {
    try {
      let address = message.token.address;
      if (!address) {
        const ret = ChainHelper.rawToAddress(message.token.chain, message.token.address_raw);
        if (ret.error) {
          console.error(`processTokenReceivedNotify: convert raw to address failed, chain: ${message.token.chain}, raw: ${message.token.address_raw}`);
          return;
        }
        address = ret.address;
      }

      const key = `${message.to}_${message.token.chain}_${address}_${message.chain}_${message.tx_hash}`;

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

  private processTokenIdInfoNotify(message: any) {
    if (!message.chain || !message.address_raw || !message.token_id) return;   
    const chain = message.chain;
    let address = message.address;
    if (!address) {
      const ret = ChainHelper.rawToAddress(chain, message.address_raw);
      if (ret.error) {
        console.error(`processTokenIdInfoNotify: convert raw to address failed, chain: ${message.chain}, raw: ${message.address_raw}`);
        return;
      }
      address = ret.address;
    }

    try {
      const id = new U256(message.token_id);
      const maxId = this.maxTokenIds[address];
      if (maxId && maxId.valid) {
        this.updateMaxTokenId(address, id);
      } else {
        this.queryTokenMaxId(address);
      }
      this.tokenIdSubject.next({ chain, address, id, existing: true });
    }
    catch (e) {
      console.log(`TokenService.processTokenIdInfoQueryAck: failed to parse message=`, message);
    }
  }

  private processTokenIdTransferNotify(message: any)
  {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const chain = message.chain;
    const addressRaw = new U256(message.address_raw, 16);
    const token = info.getToken(chain, addressRaw);
    if (!token) return;
    const id = new AccountTokenId();
    const error = id.fromJson(message);
    if (error) return;

    const receive = message.receive === 'true';
    if (receive) {
      token.addTokenId(id);
    } else {
      token.removeTokenId(id);
    }
    this.syncAccountTokenIds(account, token);
  }

  private processTokenMapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.chain_id);
    }

    const maps = info.maps[chain];
    if (!maps) return;

    const map = new MapInfo();
    const error = map.fromJson(message);
    if (error) return;
    map.confirmed = true;
    maps.insert(map);
  }

  private processTokenUnmapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const unmaps = info.unmaps;

    const unmap = new UnmapInfo();
    const error = unmap.fromJson(message);
    if (error) return;
    unmaps.insert(unmap);
    this.tokenUnmapSubject.next(unmap);
  }

  private processTokenWrapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    const wraps = info.wraps;

    const wrap = new WrapInfo();
    const error = wrap.fromJson(message);
    if (error) return;
    wraps.insert(wrap);
    this.tokenWrapSubject.next(wrap);
  }

  private processTokenUnwrapInfoNotify(message: any) {
    const account = message.account;
    const info = this.accounts[account];
    if (!info) return;
    let chain = message.from_chain;
    if (!chain) {
      chain = ChainHelper.toChainStr(+message.from_chain_id);
    }

    const unwraps = info.unwraps[chain];
    if (!unwraps) return;

    const unwrap = new UnwrapInfo();
    const error = unwrap.fromJson(message);
    if (error) return;
    unwrap.confirmed = true;
    unwraps.insert(unwrap);
  }

  private processTakeNackBlockSubmittedNotify(message: any) {
    if (!message.taker || !message.inquiry_height) return;
    const info = this.accounts[message.taker];
    if (!info) return;

    const swap = info.getActiveSwap(message.taker, new U64(message.inquiry_height));
    if (!swap) return;
    if (swap.takeNackBlockStatus !== TakeNackBlockStatus.PENDING) return;

    if (message.status === 'submitted') {
      swap.takeNackBlockStatus = TakeNackBlockStatus.SUBMITTED;
    }
    this.swapSubject.next(swap);
  }

  private processTokenSymbolAck(message: any) {
    if (!message.chain || !message.address_raw || !message.symbol) return;
    const info = this.getTokenInfo(message.chain, message.address_raw);
    if (info) {
      info.symbol = message.symbol;
      this.putTokenInfo(message.chain, message.address_raw, info);
      this.tokenInfoSubject.next({
        chain: message.chain,
        address: message.address,
        existing: true,
        info
      });
    }
    if (!this.tokenSymbols[message.chain]) {
      this.tokenSymbols[message.chain] = {};
    }
    this.tokenSymbols[message.chain][message.address] = message.symbol;
    this.tokenSymbolSubject.next({
      chain: message.chain,
      address: message.address,
      symbol: message.symbol
    });
  }

  private processTokenNameAck(message: any) {
    if (!message.chain || !message.address_raw || !message.name) return;
    const info = this.getTokenInfo(message.chain, message.address_raw);
    if (info) {
      info.name = message.name;
      this.putTokenInfo(message.chain, message.address_raw, info);
      this.tokenInfoSubject.next({
        chain: message.chain,
        address: message.address,
        existing: true,
        info
      });
    }
    if (!this.tokenNames[message.chain]) {
      this.tokenNames[message.chain] = {};
    }
    this.tokenNames[message.chain][message.address] = message.name;
    this.tokenNameSubject.next({
      chain: message.chain,
      address: message.address,
      name: message.name
    });
  }

  private processTokenTypeAck(message: any) {
    if (!message.chain || !message.address) return;
    const chain = message.chain;
    const address = message.address;
    let type = TokenType.INVALID;
    if (message.type) {
      type = TokenHelper.toType(message.type);
    }

    if (type !== TokenType.INVALID) {
      if (!this.tokenTypes[chain]) {
        this.tokenTypes[chain] = {};
      }
      this.tokenTypes[chain][address] = type;
    }
    this.tokenTypeSubject.next({ chain, address, type });
  }

  private processTokenDecimalsAck(message: any) {
    if (!message.chain || !message.address) return;
    const chain = message.chain;
    const address = message.address;
    
    let decimals = -1;
    if (message.decimals) {
      decimals = +message.decimals;
    }
    if (decimals !== -1) {
      if (!this.tokenDecimalsEntries[chain]) {
        this.tokenDecimalsEntries[chain] = {};
      }
      this.tokenDecimalsEntries[chain][address] = decimals;
    }
    this.tokenDecimalsSubject.next({ chain, address, decimals });
  }

  private processTokenWrappedAck(message: any) {
    if (message.error || !message.chain || !message.address || !message.wrapped) return;
    const chain = message.chain;
    const address = message.address;
    
    if (!this.tokenWrappedInfos[chain]) {
      this.tokenWrappedInfos[chain] = {};
    }
    const wrapped = message.wrappped === 'true';
    this.tokenWrappedInfos[chain][address] = wrapped;

    this.tokenWrappedSubject.next({ chain, address, wrapped });
  }

  private processTxTimestamp(message: any) {
    if (message.error || !message.chain || !message.tx_hash || !message.timestamp) return;
    const chain = message.chain;
    const hash = message.tx_hash;
    if (!this.txTimestamps[chain]) {
      this.txTimestamps[chain] = {};
    }
    this.txTimestamps[chain][message.tx_hash] = +message.timestamp;
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
          this.syncAccountTokenIds(address, token);
        }
      }
      this.syncTokenBlocks(address, info);
      this.accountTokensSubject.next(address);
      return false;
    }
    catch (e) {
      console.log(`updateAccountTokensInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  private syncAccountOrders(account: string) {
    const info = this.accounts[account];
    if (!info) return;
    this.queryAccountOrders(account);
    for (let order of info.orders) {
      if (order.expectedRecentSwaps === 0) continue;
      if (!order.synced || order.swaps.length === 0) {
        order.finalSync = order.order.finished();
        this.queryOrderSwaps(account, order.order.orderHeight, U64.max());
      } else if (order.moreSwaps && order.expectedRecentSwaps > order.swaps.length) {
        const tail = order.swaps[order.swaps.length - 1];
        this.queryOrderSwaps(account, order.order.orderHeight, tail.tradeHeight.minus(1));
      }
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

  private syncAccountTokenIds(account: string, info: AccountTokenInfo) {
    if (info.type !== TokenType._721) return;
    const size = info.tokenIds.length;
    if (size >= info.expectedTokenIds) return;
    if (size === 0) {
      this.queryAccountTokenIds(account, info.chain, info.address, info.expectedTokenIds);
      return;
    }

    const back = info.tokenIds[size - 1];
    const count = info.expectedTokenIds - size;
    this.queryAccountTokenIds(account, info.chain, info.address, count,  back.id.plus(1));
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

  private queryAccountTokenIds(account: string, chain: string,
                               address: string, count: number, beginId?: U256) {
    if (!beginId) beginId = U256.zero();
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error || !ret.raw) {
      console.error(`queryAccountTokenIds: failed to convert address to raw`, chain, address);
      return;
    }
    const address_raw = ret.raw.toHex();
    const message: any = {
      action: 'account_token_ids',
      service: this.SERVICE,
      account,
      chain,
      address_raw,
      count: `${count}`,
      begin_id: beginId.toDec()
    };
    this.server.send(message);
  }

  private queryAccountTokenLink(account: string, height: U64, chain: string, address: string) {
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error || !ret.raw) {
      console.error(`queryAccountTokenLink: failed to convert address to raw`, chain, address);
      return;
    }
    const address_raw = ret.raw.toHex();

    const message: any = {
      action: 'account_token_link',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address,
      address_raw
    };
    this.server.send(message);
  }

  private queryNextAccountTokenLinks(account: string, height: U64,
    chain: string, address: string, count: number = 10) {
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error || !ret.raw) {
      console.error(`queryNextAccountTokenLinks: failed to convert address to raw`, chain, address);
      return;
    }
    const address_raw = ret.raw.toHex();
  
    const message: any = {
      action: 'next_account_token_links',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address,
      address_raw,
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryPreviousAccountTokenLinks(account: string, height: U64,
    chain: string, address: string, count: number = 10) {
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error || !ret.raw) {
      console.error(`queryPreviousAccountTokenLinks: failed to convert address to raw`, chain, address);
      return;
    }
    const address_raw = ret.raw.toHex();
  
    const message: any = {
      action: 'previous_account_token_links',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      chain,
      address,
      address_raw,
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

  private queryTokenReceivables(account: string, tokens: { chain: string, address_raw: string }[], count?: U64) {
    const message: any = {
      action: 'token_receivables',
      service: this.SERVICE,
      account,
      tokens,
      count: count ? count.toDec() : '50'
    };
    this.server.send(message);
  }

  private queryTokenReceivablesSummary(account: string) {
    const message: any = {
      action: 'token_receivables_summary',
      service: this.SERVICE,
      account,
    };
    this.server.send(message);
  }

  private queryTokenMaxId(address: string) {
    const message: any = {
      action: 'token_max_id',
      service: this.SERVICE,
      chain: environment.current_chain,
      address: address
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

  private queryAccountTokensInfo(address: string) {
    const message: any = {
      action: 'account_tokens_info',
      service: this.SERVICE,
      account: address,
      request_id: `account:${address}`
    };
    this.server.send(message);
  }

  queryTokenInfo(chain: string, address: string | U256, force: boolean = false) {
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenInfo: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) { 
        console.error(`queryTokenInfo: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenInfoQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenInfoQueries[key] = this.server.getTimestamp();
    }

    const message: any = {
      action: 'token_info',
      service: this.SERVICE,
      chain,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }

  queryTokenSymbol(chain: string, address: string | U256, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain) || chain == ChainStr.INVALID || chain === '') return;
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenSymbol: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) { 
        console.error(`queryTokenSymbol: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenSymbolQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenSymbolQueries[key] = this.server.getTimestamp();
    }

    const chainId = ChainHelper.toChain(chain);
    if (chainId === Chain.INVALID) {
      console.error(`queryTokenSymbol: invalid chain id `, chainId, `, chain `, chain);
      return;
    }
    const message: any = {
      action: 'token_symbol',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }

  queryTokenName(chain: string, address: string | U256, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain)) return;
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenName: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) { 
        console.error(`queryTokenName: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenNameQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenNameQueries[key] = this.server.getTimestamp();
    }

    const chainId = ChainHelper.toChain(chain)
    const message: any = {
      action: 'token_name',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }

  queryTokenType(chain: string, address: string | U256, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain)) return;
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenType: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) {
        console.error(`queryTokenType: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenTypeQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenTypeQueries[key] = this.server.getTimestamp();
    }

    const chainId = ChainHelper.toChain(chain)
    const message: any = {
      action: 'token_type',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }

  queryTokenDecimals(chain: string, address: string | U256, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain)) return;
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenDecimals: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) {
        console.error(`queryTokenDecimals: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenDecimalsQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenDecimalsQueries[key] = this.server.getTimestamp();
    }

    const chainId = ChainHelper.toChain(chain)
    const message: any = {
      action: 'token_decimals',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }

  queryTokenWrappedInfo(chain: string, address: string | U256, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain)) return;
    let addressRaw;
    let addressEncoded;
    if (address instanceof U256) {
      const ret = ChainHelper.rawToAddress(chain, address);
      if (ret.error) {
        console.error(`queryTokenWrappedInfo: convert raw to address failed, chain=${chain}, raw=${address.toHex()}`);
        return;
      }
      addressRaw = address.toHex();
      addressEncoded = ret.address;
    } else {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) {
        console.error(`queryTokenWrappedInfo: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      addressRaw = ret.raw!.toHex();
      addressEncoded = address;
    }

    if (!force) {
      const key = `${chain}_${addressRaw}`;
      const lastQuery = this.tokenWrappedQueries[key];
      if (lastQuery && lastQuery > (this.server.getTimestamp() - 300)) return;
      this.tokenWrappedQueries[key] = this.server.getTimestamp();
    }

    const chainId = ChainHelper.toChain(chain)
    const message: any = {
      action: 'token_wrapped',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      address: addressEncoded,
      address_raw: addressRaw,
    };

    this.server.send(message);
  }


  queryTxTimestamp(chain: string, hash: string, height: number, force: boolean = false) {
    if (ChainHelper.isRaicoin(chain)) return;
    hash = hash.toLowerCase();
    if (!hash.startsWith('0x')) {
      hash = '0x' + hash;
    }

    if (!force) {
      const key = `${chain}_${hash}`;
      const lastQuery = this.txTimestampQueries[key];
      const now = window.performance.now();
      if (lastQuery && lastQuery > (now - 3000000)) return;
      this.txTimestampQueries[key] = now;
    }

    const chainId = ChainHelper.toChain(chain)
    const message: any = {
      action: 'transaction_timestamp',
      service: this.VALIDATOR_SERVICE,
      chain,
      chain_id: `${chainId}`,
      height: `${height}`,
      tx_hash: hash,
    };

    this.server.send(message);
  }

  private queryTokenIdInfo(address: string, id: U256, chain?: string) {
    if (!chain) chain = environment.current_chain;
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error) {
      console.error(`queryTokenIdInfo: convert address to raw failed, chain=${chain}, address=${address}`);
      return;
    }
    const message: any = {
      action: 'token_id_info',
      service: this.SERVICE,
      chain,
      address: address,
      address_raw: ret.raw!.toHex(),
      token_id: id.toDec()
    };
    this.server.send(message);
  }

  private queryTokenIdOwner(address: string, id: U256 | string, chain?: string) {
    if (!chain) chain = environment.current_chain;
    const ret = ChainHelper.addressToRaw(chain, address);
    if (ret.error) {
      console.error(`queryTokenIdOwner: convert address to raw failed, chain=${chain}, address=${address}`);
      return;
    }
    if (id instanceof U256) {
      id = id.toDec();
    }
    const message: any = {
      action: 'token_id_owner',
      service: this.SERVICE,
      chain,
      address: address,
      address_raw: ret.raw!.toHex(),
      token_id: id
    };
    this.server.send(message);
  }

  private queryAccountActiveSwaps(account: string) {
    const message: any = {
      action: 'account_active_swaps',
      service: this.SERVICE,
      account
    };
    this.server.send(message);
  }

  queryAccountSwapInfo(account: string) {
    const message: any = {
      action: 'account_swap_info',
      service: this.SERVICE,
      account
    };
    this.server.send(message);
  }

  private queryAccountOrders(account: string, height?: U64) {
    if (!height) height = U64.max();
    const message: any = {
      action: 'account_orders',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      count: '10'
    };
    this.server.send(message);
  }

  private queryAccountHead(account: string) {
    const message: any = {
      action: 'account_head',
      service: this.SERVICE,
      account,
    };
    this.server.send(message);
  }

  private queryOrderSwaps(maker: string, height: U64, tradeHeight?: U64) {
    if (!tradeHeight) tradeHeight = U64.max();
    const message: any = {
      action: 'order_swaps',
      service: this.SERVICE,
      maker,
      height: height.toDec(),
      trade_height: tradeHeight.toDec(),
      count: '10'
    };
    this.server.send(message);
  }

  private querySwapMainAccount(account: string) {
    const message: any = {
      action: 'swap_main_account',
      service: this.SERVICE,
      account
    };
    this.server.send(message);
  }

  private queryOrderInfo(account: string, height: U64) {
    const message: any = {
      action: 'order_info',
      service: this.SERVICE,
      account,
      height: height.toDec(),
    };
    this.server.send(message);
  }

  private queryMakerSwaps(account: string, height: U64 = U64.max(), count: number = 10) {
    const message: any = {
      action: 'maker_swaps',
      service: this.SERVICE,
      account,
      height: height.toDec(),
    };
    if (count) {
      message.count = `${count}`;
    }
    this.server.send(message);
  }

  private queryTakerSwaps(account: string, height: U64 = U64.max(), count: number = 10) {
    const message: any = {
      action: 'taker_swaps',
      service: this.SERVICE,
      account,
      height: height.toDec(),
      count: `${count}`
    };
    this.server.send(message);
  }

  private queryPendingTokenMapInfos(account: string, chain: string) {
    const message: any = {
      action: 'pending_token_map_infos',
      service: this.SERVICE,
      account,
      chain,
    };
    this.server.send(message);
  }

  private queryTokenMapInfos(account: string, chain: string, previous?: MapInfo) {
    let height = U64.max();
    let index = U64.max();
    if (previous) {
      height = new U64(previous.height);
      index = new U64(previous.index);
      index = index.minus(1)
      if (index.eq(U64.max())) {
        height = height.minus(1);
      }
      if (height.eq(U64.max())) {
        console.error(`queryTokenMapInfos: unexpected params, height=${previous.height}, index=${previous.index}`);
        return;
      }
    }
    const message: any = {
      action: 'token_map_infos',
      service: this.SERVICE,
      account,
      chain,
      height: height.toDec(),
      index: index.toDec(),
      count: '10',
    };

    this.server.send(message);
  }

  private queryTokenUnmapInfos(account: string, height?: number | string) {
    if (height === undefined) {
      height = U64.max().toDec();
    } else if (typeof height === 'number') {
      if (height < 0) {
        console.error(`TokenService::queryTokenUnapInfos: invalid height=`, height);
        return
      }
      height = `${height}`;
    }

    const message: any = {
      action: 'token_unmap_infos',
      service: this.SERVICE,
      account,
      height,
      count: '10',
    };

    this.server.send(message);
  }

  private queryTokenWrapInfos(account: string, height?: number | string) {
    if (height === undefined) {
      height = U64.max().toDec();
    } else if (typeof height === 'number') {
      if (height < 0) {
        console.error(`TokenService::queryTokenWrapInfos: invalid height=`, height);
        return
      }
      height = `${height}`;
    }

    const message: any = {
      action: 'token_wrap_infos',
      service: this.SERVICE,
      account,
      height,
      count: '10',
    };

    this.server.send(message);
  }

  private queryPendingTokenUnwrapInfos(account: string, chain: string) {
    const message: any = {
      action: 'pending_token_unwrap_infos',
      service: this.SERVICE,
      account,
      chain,
    };
    this.server.send(message);
  }

  private queryTokenUnwrapInfos(account: string, chain: string, previous?: UnwrapInfo) {
    let height = U64.max();
    let index = U64.max();
    if (previous) {
      height = new U64(previous.height);
      index = new U64(previous.index);
      index = index.minus(1)
      if (index.eq(U64.max())) {
        height = height.minus(1);
      }
      if (height.eq(U64.max())) {
        console.error(`queryTokenUnwrapInfos: unexpected params, height=${previous.height}, index=${previous.index}`);
        return;
      }
    }
    const message: any = {
      action: 'token_unwrap_infos',
      service: this.SERVICE,
      account,
      chain,
      height: height.toDec(),
      index: index.toDec(),
      count: '10',
    };

    this.server.send(message);
  }

  private purgeMakers() {
    const accounts : string[] = [];
    const now = this.server.getTimestamp();
    for (let account in this.makers) {
      const info = this.makers[account];
      if (info.orders.length > 0
        || info.lastPing + AppHelper.SWAP_PING_PONG_INTERVAL > now) {
        continue;
      } 
      accounts.push(account);
    }

    for (let account of accounts) {
      delete this.makers[account];
    }
  }

  private putTokenBlock(account: string, height: U64, token_block: TokenBlock) {
    const key = `${account}_${height.toDec()}`;
    this.tokenBlocks[key] = token_block;
  }

  private getTokenBlock(account: string, height: U64): TokenBlock | undefined {
    const key = `${account}_${height.toDec()}`;
    return this.tokenBlocks[key];
  }

  private putTokenInfo(chain: string, addressRaw: U256 | string, info: TokenInfo) {
    if (addressRaw instanceof U256) {
      addressRaw = addressRaw.toHex();
    }
    const key = `${chain}_${addressRaw}`;
    this.tokenInfos[key] = info;
  }

  private getTokenInfo(chain: string | Chain, addressRaw: U256 | string): TokenInfo | undefined {
    if (typeof chain === 'number') {
      chain = ChainHelper.toChainStr(chain);
    }
    if (addressRaw instanceof U256) {
      addressRaw = addressRaw.toHex();
    }
    const key = `${chain}_${addressRaw}`;
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
    if (!this.shouldReceive(receivable.to, receivable.token.chain, receivable.token.address)) {
      return;
    }
    const info = this.accounts[receivable.to];
    if (!info) return;
    if (this.receivings[receivable.key()]) return;
    if (info.receivables.find(x => x.key() === receivable.key())) return;
    info.receivables.push(receivable);
  }

  private updateMaxTokenId(address: string, id?: U256) {
    let item = this.maxTokenIds[address];
    if (!item) item = new MaxTokenId();
    if (!id) {
      this.maxTokenIds[address] = item;
      return;
    }
    item.valid = true;
    if (id.gt(item.id)) item.id = id;
    this.maxTokenIds[address] = item;
  }

  private updateAccountActiveSwap(info: AccountTokensInfo, swap: SwapFullInfo) {
    const inserted = info.updateActiveSwap(swap, this.server.getTimestamp());
    if (inserted) {
      this.addTaker(swap.taker.account, swap.taker);
    }
  }

  private shouldReceive(account: string, chain: string, address: string): boolean {
    const info = this.accounts[account];
    if (!info) return false;
    if (this.isRaicoin(chain) && account === address) return true;
    if (info.getToken(chain, address)) return true;
    if (this.settings.hasAsset(account, chain, address)) return true;
    if (this.tokenVerified(chain, address)) return true;
    return false;
  }

  private tokenVerified(chain: string, address: string): boolean {
    if (ChainHelper.isNative(chain, address)) {
      return this.verified.hasToken(chain, '');
    } else {
      return this.verified.hasToken(chain, address);
    }
  }

  private searchOrder(message: any) {
    message.action = 'search_orders';
    message.service = this.SERVICE;
    this.server.send(message);
  }

}

export class AccountTokenInfo {
  chain: string = '';
  chainShown: string = '';
  address: string = ''; // token address
  addressRaw: U256 = U256.zero();
  name: string = '';
  symbol: string = '';
  type: TokenType = TokenType.INVALID;
  decimals: U8 = new U8();
  balance: U256 = U256.zero();
  balanceFormatted: string = '';
  headHeight: U64 = U64.max();
  tokenBlockCount: U64 = U64.zero();
  circulable: boolean = true;

  //local data
  expectedRecentBlocks: number = 10;
  tokenBlockLinks: TokenBlockLinks = new TokenBlockLinks();
  expectedTokenIds: number = 100;
  tokenIds: AccountTokenId[] = [];

  addTokenId(id: AccountTokenId) {
    const size = this.tokenIds.length;
    if (size === 0 || id.id.gt(this.tokenIds[size - 1].id)) {
      this.tokenIds.push(id);
      return;
    }

    const index = this.tokenIds.findIndex(x => x.id.gt(id.id));
    if (index === -1) return;
    if (index === 0 || !this.tokenIds[index - 1].id.eq(id.id)) {
      this.tokenIds.splice(index, 0, id);
    }
  }

  removeTokenId(id: AccountTokenId) {
    const index = this.tokenIds.findIndex(x => x.id.eq(id.id));
    if (index !== -1) {
      this.tokenIds.splice(index, 1);
    }
  }

  ownTokenId(id: U256): boolean {
    const index = this.tokenIds.findIndex(x => x.id.eq(id));
    return index !== -1;
  }

  hasMoreTokenIds(): boolean {
    if (this.type !== TokenType._721) return false;
    return this.balance.gt(this.tokenIds.length);
  }

  fromJson(json: any): boolean {
    try {
      this.chain = json.token.chain;
      this.chainShown = ChainHelper.toChainShown(this.chain);
      this.address = json.token.address;
      this.addressRaw = new U256(json.token.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`AccountTokenInfo.fromJson: convert raw to address failed, chain=${this.chain}, address_raw=${json.token.address_raw}`);
          return true;
        }
        this.address = ret.address!;
      }

      this.name = json.token.name;
      this.symbol = json.token.symbol;
      this.type = TokenHelper.toType(json.token.type);
      this.decimals = new U8(json.token.decimals);
      this.balance = new U256(json.balance);
      this.balanceFormatted = json.balance_formatted;
      this.headHeight = new U64(json.head_height);
      this.tokenBlockCount = new U64(json.token_block_count);
      this.circulable = json.token.circulable === 'true';
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
    this.expectedTokenIds = other.expectedTokenIds;
    this.tokenIds = other.tokenIds;
  }
}

class AccountTokensInfo {
  address: string = '';
  subscribed: boolean = false;
  synced: boolean = false;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  issuerInfo: IssuerInfo = new IssuerInfo();
  swapMainAccountQueried: boolean = false;
  swapMainAccount: string = '';
  swapInfoQueried: boolean = false;
  swapInfo: AccountSwapInfo | undefined;

  headHeight: U64 = U64.max();
  tokenBlockCount: U64 = new U64();
  tokens: AccountTokenInfo[] = [];
  receivables: TokenReceivable[] = [];
  orders: OrderSwapInfo[] = [];
  moreOrders: boolean = true;
  minOrderHeight: U64 = U64.max();
  activeSwaps: SwapFullInfo[] = [];
  swapInquiries: {height: U64, timeout: U64}[]= [];
  swaps: SwapFullInfo[] = [];
  makerSwaps: SwapFullInfo[] = [];
  takerSwaps: SwapFullInfo[] = [];
  moreMakerSwaps: boolean = true;
  moreTakerSwaps: boolean = true;
  tokenBlockLinks: TokenBlockLinks = new TokenBlockLinks();
  maps: { [chain: string]: AccountTokenMapInfos } = {};
  unmaps: AccountTokenUnmapInfos = new AccountTokenUnmapInfos();
  wraps: AccountTokenWrapInfos = new AccountTokenWrapInfos();
  unwraps: { [chain: string]: AccountTokenUnwrapInfos } = {};


  //local data
  expectedRecentBlocks: number = 10;
  expectedRecentOrders: number = 10;
  expectedRecentSwaps: number = 10;
  lastPong: number = 0;

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

  getOrder(height: string | U64): OrderSwapInfo | undefined {
    return this.orders.find(x => x.order.orderHeight.eq(height));
  }

  updateOrder(order: OrderInfo, sort: boolean = true): boolean {
    const index = this.orders.findIndex(x => x.order.orderHeight.eq(order.orderHeight));
    if (index === -1) {
      const orderSwap = new OrderSwapInfo();
      orderSwap.order = order;
      this.orders.push(orderSwap);
      if (sort) this.sortOrders();
      if (order.orderHeight.lt(this.minOrderHeight)) {
        this.minOrderHeight = order.orderHeight;
      }
      return true;
    } else {
      this.orders[index].order = order;
      if (sort) this.sortOrders();
      return false;
    }
  }

  minMakerSwapHeight(): U64 {
    if (this.makerSwaps.length === 0) return U64.max();
    return this.makerSwaps[this.makerSwaps.length - 1].swap.tradeHeight;
  }

  minTakerSwapHeight(): U64 {
    if (this.takerSwaps.length === 0) return U64.max();
    return this.takerSwaps[this.takerSwaps.length - 1].swap.inquiryHeight;
  }

  updateSwap(swap: SwapFullInfo, sort: boolean = true): boolean {
    if (swap.swap.maker === this.address) {
      const inserted = this._updateSwap(this.makerSwaps, swap);
      if (inserted && sort) this.sortMakerSwaps();
      return inserted;
    } else if (swap.swap.taker === this.address) {
      const inserted = this._updateSwap(this.takerSwaps, swap);
      if (inserted && sort) this.sortTakerSwaps();
      return inserted;
    } else {
      return false;
    }
  }

  private _updateSwap(swaps: SwapFullInfo[], swap: SwapFullInfo): boolean {
    const index = swaps.findIndex(x => x.eq(swap));
    if (index === -1) {
      swaps.push(swap);
      return true;
    } else {
      swaps[index] = swap;
      return false;
    }
  }

  takerSwapExists(swap: SwapFullInfo): boolean {
    return this.takerSwaps.findIndex(x => x.eq(swap)) !== -1;
  }

  makerSwapExists(swap: SwapFullInfo): boolean {
    return this.makerSwaps.findIndex(x => x.eq(swap)) !== -1;
  }

  sortMakerSwaps() {
    this.sortSwaps(this.makerSwaps);
  }

  sortTakerSwaps() {
    this.sortSwaps(this.takerSwaps);
  }

  private sortSwaps(swaps: SwapFullInfo[]) {
    swaps.sort((lhs, rhs) => this.cmpSwap(lhs, rhs));
  }

  mergeSwaps() {
    this.swaps = [];
    let i = 0;
    let j = 0;
    while ((i < this.makerSwaps.length || j < this.takerSwaps.length)
      && this.swaps.length < this.expectedRecentSwaps) {
      if (i < this.makerSwaps.length && j < this.takerSwaps.length) {
        const lhs = this.makerSwaps[i];
        const rhs = this.takerSwaps[j];
        if (this.cmpSwap(lhs, rhs) < 0) {
          this.swaps.push(lhs);
          ++i;
        } else {
          this.swaps.push(rhs);
          ++j;
        }
      } else if (i < this.makerSwaps.length) {
        this.swaps.push(this.makerSwaps[i]);
        ++i;
      } else if (j < this.takerSwaps.length) {
        this.swaps.push(this.takerSwaps[j]);
        ++j;
      } else {
        break;
      }
    }
  }

  cmpSwap(lhs: SwapFullInfo, rhs: SwapFullInfo) {
    let lhsHeight;
    let lhsMaker;
    if (this.address === lhs.swap.maker) {
      lhsHeight = lhs.swap.tradeHeight;
      lhsMaker = true;
    } else {
      lhsHeight = lhs.swap.inquiryHeight;
      lhsMaker = false;
    }

    let rhsHeight;
    let rhsMaker;
    if (this.address === rhs.swap.maker) {
      rhsHeight = rhs.swap.tradeHeight;
      rhsMaker = true;
    } else {
      rhsHeight = rhs.swap.inquiryHeight;
      rhsMaker = false;
    }

    if (lhsHeight.gt(rhsHeight)) return -1;
    if (lhsHeight.lt(rhsHeight)) return 1;
    if (lhsMaker && !rhsMaker) return -1;
    if (!lhsMaker && rhsMaker) return 1;
    if (!lhsMaker && !rhsMaker) return 0;
    
    if (lhs.swap.taker < rhs.swap.taker) return -1;
    if (lhs.swap.taker > rhs.swap.taker) return 1;
    return 0;
  }

  getActiveSwap(taker: string, inquiryHeight: U64): SwapFullInfo | undefined {
    return this.activeSwaps.find(x => x.swap.taker === taker && x.swap.inquiryHeight.eq(inquiryHeight));
  }

  updateActiveSwap(swap: SwapFullInfo, now: number): boolean {
    if (swap.swap.timeout.gt(now + AppHelper.SWAP_TIMEOUT + 20)) {
      return false;
    }

    const index = this.activeSwaps.findIndex(x => x.eq(swap));
    if (index !== -1) {
      swap.copyLocalData(this.activeSwaps[index]);
      this.activeSwaps[index] = swap;
      this.tryRemoveSwapInquiry(swap.swap);
      return false;
    } else {
      if (swap.swap.finished() || swap.swap.expired(now)) return false;
      this.activeSwaps.push(swap);
      this.tryRemoveSwapInquiry(swap.swap);
      return true;
    }
  }

  purgeActiveSwaps(now: number): SwapFullInfo[] {
    const purged: SwapFullInfo[] = [];
    for (let i = this.activeSwaps.length - 1; i >= 0; i--) {
      const swap = this.activeSwaps[i];
      if (swap.swap.finished() || swap.swap.expired(now) || swap.order.finished()) {
        if (swap.swap.status === SwapStatus.TAKE && this.address === swap.swap.taker) {
          continue;
        }
        purged.push(swap);
        if (this.address === swap.swap.taker) {
          this.removeSwapInquiry(swap.swap.inquiryHeight)
        }
        this.activeSwaps.splice(i, 1);
      }
    }
    return purged;
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

  sortOrders() {
    this.orders.sort((lhs, rhs) => {
      if (lhs.order.finished() && !rhs.order.finished()) {
        return 1;
      }
      if (!lhs.order.finished() && rhs.order.finished()) {
        return -1;
      }
      if (lhs.order.orderHeight.gt(rhs.order.orderHeight)) {
        return -1;
      }
      if (lhs.order.orderHeight.lt(rhs.order.orderHeight)) {
        return 1;
      }
      return 0;
    });
  }

  getToken(chain: string, address: U256 | string): AccountTokenInfo | undefined {
    if (typeof address === 'string') {
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error || !ret.raw) return undefined;
      address = ret.raw;
    }
    return this.tokens.find(x => x.chain === chain && x.addressRaw.eq(address));
  }

  swapLimited(): boolean {
    if (!this.swapInfo) return false;
    if (!this.swapInfo.credit.eq(0)) return false;
    if (this.swapInfo.limited) return true;
    return false;
  }

  orderLimited(): boolean {
    if (!this.swapInfo) return false;
    if (this.swapInfo.credit.eq(0)) return false;
    if (this.swapInfo.activeOrders.gte(this.swapInfo.credit)) return true;
    return false;
  }

  orderCancelling(height: U64): boolean {
    const order = this.getOrder(height);
    if (!order) return false;
    if (order.order.finished()) return false;
    return order.cancelSent;
  }

  swappingAsMaker(): boolean {
    return !!this.getMakerSwappingItem();
  }

  getMakerSwappingItem(): SwapFullInfo | undefined {
    return this.activeSwaps.find(x => x.swapping() && this.address === x.swap.maker);
  }

  addSwapInquiry(height: U64, timeout: U64) {
    const index = this.swapInquiries.findIndex(x => x.height.eq(height));
    if (index === -1) {
      this.swapInquiries.push({height, timeout});
    }
  }

  removeSwapInquiry(height: U64) {
    const index = this.swapInquiries.findIndex(x => x.height.eq(height));
    if (index !== -1) {
      this.swapInquiries.splice(index, 1);
    }
  }

  tryRemoveSwapInquiry(swap: SwapInfo) {
    if (this.address !== swap.taker) return;
    if (swap.finished() || swap.status === SwapStatus.TAKE) {
      this.removeSwapInquiry(swap.inquiryHeight);
    }
  }

  purgeSwapInquiries(now: number) {
    for (let i = this.swapInquiries.length - 1; i >= 0; i--) {
      const inquiry = this.swapInquiries[i];
      if (inquiry.timeout.lt(now)) {
        this.swapInquiries.splice(i, 1);
      }
    }
  }

  pendingSwapInquiries(): number {
    return this.swapInquiries.length;
  }

}


export class TokenBlock {
  status: string = '';
  statusCode: U32 = new U32();
  hash: U256 = U256.zero();
  block: any = null;
  value: U256 = U256.zero();
  valueOp: string = '';
  chain: string = '';
  address: string = ''; 
  addressRaw: U256 = U256.zero();
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
      if (!this.address && this.chain !== 'invalid') {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`TokenBlock.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
    
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
  addressRaw: U256 = U256.zero();
  type: TokenType = TokenType.INVALID;
  symbol: string = '';
  name: string = '';
  decimals: U8 = new U8();
  burnable: boolean = false;
  mintable: boolean = false;
  circulable: boolean = false;
  holders: U64 = U64.zero();
  transfers: U64 = U64.zero();
  swaps: U64 = U64.zero();
  created_at: U64 = U64.zero();
  totalSupply: U256 = U256.zero();
  totalSupplyFormatted: string = '';
  capSupply: U256 = U256.zero();
  capSupplyFormatted: string = '';
  localSupply: U256 = U256.zero();
  localSupplyFormatted: string = '';
  baseUri: string = '';

  fromJson(json: any): boolean {
    try {
      this.chain = json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`TokenInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
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
      this.baseUri = json.base_uri;
      return false;
    }
    catch (e) {
      console.log(`TokenInfo.fromJson: failed to parse json=`, json, 'exception=', e);
      return true;
    }
  }

}

export class AccountTokenId {
  id: U256 = U256.max();
  uri: string = '';

  fromJson(json: any): boolean {
    try {
      this.id = new U256(json.token_id);
      this.uri = json.uri;
      return false;
    }
    catch (e) {
      console.log(`AccountTokenId.fromJson: failed to parse json=`, json, 'exception=', e);
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
  addressRaw: U256 = U256.zero();
  type: string = '';
  name: string = '';
  symbol: string = '';
  decimals: U8 = new U8();

  fromJson(json: any): boolean {
    try {
      this.chain =  json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`TokenReceivableTokenInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
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
  txHash: U256 = U256.zero();
  from: string = '';
  fromRaw: U256 = U256.zero();
  value: U256 = U256.zero();
  blockHeight: U64 = U64.zero();
  sourceType: string = '';
  block: any = null;
  index: number = 0;

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
      if (!this.from) {
        const ret = ChainHelper.rawToAddress(this.chain, this.fromRaw);
        if (ret.error) {
          console.error(`TokenReceivable.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.fromRaw.toHex()}`);
          return true;
        }
        this.from = ret.address!;
      }
      this.value = new U256(json.value);
      this.blockHeight = new U64(json.block_height);
      this.sourceType = json.source;
      this.block = json.source_block;
      this.index = +json.index;
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

  valueFormatted(symbol: string = ''): string {
    if (!symbol) {
      symbol = this.token.symbol;
    }
    if (this.token.type === TokenTypeStr._721) {
      return '1 ' + symbol;
    }

    return this.value.toBalanceStr(this.token.decimals) + ' ' + symbol;
  }

}

class MaxTokenId { 
  id: U256 = new U256();
  valid: boolean = false;
}

export class AccountSwapInfo {
  account: string = '';
  activeOrders: U64 = U64.zero();
  totalOrders: U64 = U64.zero();
  activeSwaps: U64 = U64.zero();
  totalSwaps: U64 = U64.zero();
  ping: U64 = U64.zero();
  pong: U64 = U64.zero();
  credit: U16 = new U16(0);
  limited: boolean = false;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.activeOrders = new U64(json.active_orders);
      this.totalOrders = new U64(json.total_orders);
      this.activeSwaps = new U64(json.active_swaps);
      this.totalSwaps = new U64(json.total_swaps);
      this.ping = new U64(json.ping);
      this.pong = new U64(json.pong);
      this.credit = new U16(json.credit);
      this.limited = json.limited === 'true';
      return false;
    }
    catch (e) {
      console.error(`AccountSwapInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

export class TokenKey {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = U256.zero();
  type: string = '';

  fromParams(chain: string, addressRaw: U256, type: string): boolean {
    this.chain = chain;
    this.addressRaw = addressRaw;
    this.type = type;
    const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
    if (ret.error) {
      console.error(`TokenKey.constructor: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
      return true;
    }
    this.address = ret.address!;
    return false;
  }

  eq(other: TokenKey): boolean {
    return this.chain === other.chain && this.addressRaw.eq(other.addressRaw)
      && this.type === other.type;
  }

  fromJson(json: any): boolean {
    try {
      this.chain = json.chain;
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      this.type = json.type;
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) return true;
        this.address = ret.address!;
      }
      return false;
    }
    catch (e) {
      console.log(`TokenKey.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  toJson(): any {
    return {
      chain: this.chain,
      address: this.address,
      address_raw: this.addressRaw.toHex(),
      type: this.type
    };
  }

}

export class OrderInfo {
  maker: AccountSwapInfo = new AccountSwapInfo();
  orderHeight: U64 = U64.max();
  mainAccount: string = '';
  tokenOffer: TokenKey = new  TokenKey();
  tokenWant: TokenKey = new TokenKey();
  valueOffer: U256 = U256.zero();
  valueWant: U256 = U256.zero();
  minOffer: U256 = U256.zero();
  maxOffer: U256 = U256.zero();
  leftOffer: U256 = U256.zero();
  timeout: U64 = U64.zero();
  finishedBy: string = '';
  finishedHeight: U64 = U64.max();
  hash: U256 = U256.zero();
  createdAt: U64 = U64.zero();

  private price: U512 | undefined;

  eq(other: OrderInfo): boolean {
    return this.hash.eq(other.hash);
  }

  normalizedPrice(): U512 {
    if (this.price) return this.price;

    const base = new U512(U256.max()).plus(1);
    if (this.tokenOffer.type === TokenTypeStr._20
      && this.tokenWant.type === TokenTypeStr._20) {
      this.price = new U512(this.valueWant).mul(base).idiv(this.valueOffer);
    } else if (this.tokenOffer.type === TokenTypeStr._20
      && this.tokenWant.type === TokenTypeStr._721) {
        this.price = new U512(1).mul(base).idiv(this.valueOffer);
    } else if (this.tokenOffer.type === TokenTypeStr._721
      && this.tokenWant.type === TokenTypeStr._20) {
        this.price = new U512(this.valueWant).mul(base);
    } else if (this.tokenOffer.type === TokenTypeStr._721
      && this.tokenWant.type === TokenTypeStr._721) {
        this.price = base;
    } else {
      this.price = U512.max();
    }
    return this.price;
  }

  fillRate(): number {
    if (this.fulfilled()) {
      return 100;
    }

    if (!this.fungiblePair()) {
      return 0;
    }

    if (this.maxOffer.eq(0)) {
      return 0;
    }

    return new U512(this.maxOffer).minus(this.leftOffer).mul(100).idiv(this.maxOffer).toNumber();
  }

  active(now: number): boolean {
    return !this.finished() && !this.expired(now);
  }

  finished(): boolean {
    return this.finishedBy === 'cancel' || this.finishedBy === 'fulfill';
  }

  fulfilled(): boolean {
    return this.finishedBy === 'fulfill';
  }

  cancelled(): boolean {
    return this.finishedBy === 'cancel';
  }

  expired(now: number): boolean {
    return this.timeout.lt(now);
  }

  fungiblePair(): boolean {
    return this.tokenOffer.type === TokenTypeStr._20 && this.tokenWant.type === TokenTypeStr._20;
  }

  availableOfferMin(): U256 {
    if (!this.fungiblePair()) return U256.zero();
    if (this.leftOffer.lt(this.minOffer)) return this.leftOffer;
    return this.minOffer;
  }

  availableOfferMax(): U256 {
    if (!this.fungiblePair()) return U256.zero();
    return this.leftOffer;
  }

  availableWantMin(): U256 {
    if (!this.fungiblePair()) return U256.zero();
    const minOffer = this.availableOfferMin();
    const secure = new U512(minOffer).mul(this.valueWant).idiv(this.valueOffer);
    return new U256(secure.toBigNumber());
  }

  availableWantMax(): U256 {
    if (!this.fungiblePair()) return U256.zero();
    const maxOffer = this.availableOfferMax();
    const secure = new U512(maxOffer).mul(this.valueWant).idiv(this.valueOffer);
    return new U256(secure.toBigNumber());
  }

  fromJson(json: any): boolean {
    try {
      let error = this.maker.fromJson(json.maker);
      if (error) return true;
      this.orderHeight = new U64(json.order_height);
      this.mainAccount = json.main_account;
      error = this.tokenOffer.fromJson(json.token_offer);
      if (error) return true;
      error = this.tokenWant.fromJson(json.token_want);
      if (error) return true;
      this.valueOffer = new U256(json.value_offer);
      this.valueWant = new U256(json.value_want);
      this.minOffer = new U256(json.min_offer);
      this.maxOffer = new U256(json.max_offer);
      this.leftOffer = new U256(json.left_offer);
      this.timeout = new U64(json.timeout);
      this.finishedBy = json.finished_by;
      this.finishedHeight = new U64(json.finished_height);
      this.hash = new U256(json.hash, 16);
      this.createdAt = new U64(json.created_at);
      return false;
    }
    catch (e) {
      console.log(`OrderInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

export enum SwapStatus {
  INQUIRY = 'inquiry',
  INQUIRY_ACK = 'inquiry_ack',
  INQUIRY_NACK = 'inquiry_nack',
  TAKE = 'take',
  TAKE_ACK = 'take_ack',
  TAKE_NACK = 'take_nack',
  INVALID = 'invalid',
}

export class SwapInfo {
  status: string = '';
  maker: string = '';
  orderHeight: U64 = U64.zero();
  taker: string = '';
  inquiryHeight: U64 = U64.zero();
  inquiryAckHeight: U64 = U64.zero();
  takeHeight: U64 = U64.zero();
  tradeHeight: U64 = U64.zero();
  timeout: U64 = U64.zero();
  value: U256 = U256.zero();
  takerShare: U256 = U256.zero();
  makerShare: U256 = U256.zero();
  makerSignature: U512 = new U512(0);
  tradePrevious: U256 = U256.zero();
  hash: U256 = U256.zero();
  createdAt: U64 = U64.zero();

  success(): boolean {
    return this.status === SwapStatus.TAKE_ACK;
  }

  finished(): boolean {
    return this.status === SwapStatus.INQUIRY_NACK || this.status === SwapStatus.TAKE_ACK
      || this.status === SwapStatus.TAKE_NACK;
  }

  expired(now: number): boolean {
    return this.timeout.lt(now);
  }

  fromJson(json: any): boolean {
    try {
      this.status = json.status;
      this.maker = json.order.maker.account;
      this.orderHeight = new U64(json.order.order_height);
      this.taker = json.taker.account;
      this.inquiryHeight = new U64(json.inquiry_height);
      this.inquiryAckHeight = new U64(json.inquiry_ack_height);
      this.takeHeight = new U64(json.take_height);
      this.tradeHeight = new U64(json.trade_height);
      this.timeout = new U64(json.timeout);
      this.value = new U256(json.value);
      this.takerShare = new U256(json.taker_share, 16);
      this.makerShare = new U256(json.maker_share, 16);
      this.makerSignature = new U512(json.maker_signature, 16);
      this.tradePrevious = new U256(json.trade_previous, 16);
      this.hash = new U256(json.hash, 16);
      this.createdAt = new U64(json.created_at);
      return false;
    }
    catch (e) {
      console.log(`SwapInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

export class OrderSwapInfo {
  static readonly DEFAULT_EXPECTED_RECENT_SWAPS = 0;

  order: OrderInfo = new OrderInfo();
  swaps: SwapInfo[] = [];

  //local data
  expectedRecentSwaps: number = OrderSwapInfo.DEFAULT_EXPECTED_RECENT_SWAPS;
  synced: boolean = false;
  finalSync: boolean = false;
  moreSwaps: boolean = true;
  cancelSent: boolean = false;

  minTradeHeigt(): U64 {
    if (this.swaps.length === 0) return U64.max();
    return this.swaps[this.swaps.length - 1].tradeHeight;
  }

  updateSwap(swap: SwapInfo, sort?: boolean): boolean {
    if (typeof sort === 'undefined') sort = true;
    const index = this.swaps.findIndex(x => x.tradeHeight.eq(swap.tradeHeight));
    if (index === -1) {
      this.swaps.push(swap);
      if (sort) this.sortSwaps();
      return true;
    } else {
      this.swaps[index] = swap;
      if (sort) this.sortSwaps();
      return false;
    }
  }

  sortSwaps() {
    this.swaps.sort((lhs, rhs) => {
      if (lhs.tradeHeight.gt(rhs.tradeHeight)) {
        return -1;
      }
      if (lhs.tradeHeight.lt(rhs.tradeHeight)) {
        return 1;
      }

      return 0;
    });
  }
}

export enum TakeNackBlockStatus {
  INIT = 'init',
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  ERROR = 'error',
}

export class SwapFullInfo {
  order: OrderInfo = new OrderInfo();
  taker: AccountSwapInfo = new AccountSwapInfo();
  swap: SwapInfo = new SwapInfo();

  // local data
  inquiryAckSent: boolean = false;
  takeSent: boolean = false;
  takeAckSent: boolean = false;
  takeNackSentTime: number = 0;
  takeNackBlockStatus: string = TakeNackBlockStatus.INIT;
  takeNackBlock: any = null;
  _ackValue: U256 | undefined;

  eq(other: SwapFullInfo): boolean {
    return this.swap.taker === other.swap.taker
      && this.swap.inquiryHeight.eq(other.swap.inquiryHeight);
  }

  copyLocalData(other: SwapFullInfo) {
    this.inquiryAckSent = other.inquiryAckSent;
    this.takeSent = other.takeSent;
    this.takeAckSent = other.takeAckSent;
    this.takeNackSentTime = other.takeNackSentTime;
    this.takeNackBlockStatus = other.takeNackBlockStatus;
    this.takeNackBlock = other.takeNackBlock;
    this._ackValue = other._ackValue;
  }

  swapping(): boolean {
    if (this.swap.status === SwapStatus.INQUIRY_ACK || this.swap.status === SwapStatus.TAKE
       || this.inquiryAckSent) return true;
    return false;
  }

  ackValue(): U256 | undefined {
    if (this._ackValue) return this._ackValue;
    if (this.order.fungiblePair()) {
      const secure = new U512(this.swap.value).mul(this.order.valueOffer);
      if (!secure.mod(this.order.valueWant).eq(0)) return undefined;
      const ack = secure.idiv(this.order.valueWant);
      this._ackValue = new U256(ack.toDec());
      return this._ackValue;
    } else {
      if (!this.swap.value.eq(this.order.valueWant)) return undefined;
      this._ackValue = this.order.valueOffer;
      return this._ackValue;
    }
  }

  fromJson(json: any): boolean {
    try {
      let error = this.order.fromJson(json.order);
      if (error) return true;
      error = this.taker.fromJson(json.taker);
      if (error) return true;
      error = this.swap.fromJson(json);
      if (error) return true;
      return false;
    }
    catch (e) {
      console.log(`SwapFullInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

export enum SearchLimitBy {
  NONE = '',
  FROM_TOKEN = 'from_token',
  TO_TOKEN = 'to_token',
}

export class MakerInfo {
  address: string = '';
  swapInfo: AccountSwapInfo = new AccountSwapInfo();
  head: AccountHead = new AccountHead();
  orders: MakerOrderInfo[] = [];
  mainAccounts: {[account: string]: AccountHead} = {};

  swapInfoQueried: boolean = false;
  headQueried: boolean = false;
  lastPing: number = 0;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;

  getOrder(height: U64): MakerOrderInfo | undefined {
    return this.orders.find(x => x.order.orderHeight.eq(height));
  }

  updateOrder(order: OrderInfo, now: number): boolean {
    const index = this.orders.findIndex(x => x.order.orderHeight.eq(order.orderHeight));
    if (index === -1) {
      const makerOrderInfo = new MakerOrderInfo();
      makerOrderInfo.order = order;
      makerOrderInfo.status = this.calcOrderActionStatus(order, now);
      this.orders.push(makerOrderInfo);
      if (!this.mainAccounts[order.mainAccount]) {
        this.mainAccounts[order.mainAccount] = new AccountHead();
      }
      return true;
    } else {
      this.orders[index].order = order;
      this.orders[index].status = this.calcOrderActionStatus(order, now);
      return false;
    }
  }

  removeOrder(order: OrderInfo) {
    const index = this.orders.findIndex(x => x.order.orderHeight.eq(order.orderHeight));
    if (index === -1) return;
    this.orders.splice(index, 1);
    for (let i of this.orders) {
      if (i.order.mainAccount === order.mainAccount) return;
    }
    delete this.mainAccounts[order.mainAccount];
  }

  synced(): boolean {
    return this.swapInfoQueried && this.headQueried;
  }

  hasMainAccount(account: string): boolean {
    return !!this.mainAccounts[account];
  }

  txnLimited(now: number): boolean {
    return this.head.txnLimited(now);
  }

  swapLimited(): boolean {
    return this.swapInfo.limited;
  }

  mainAccountSynced(account: string): boolean {
    const mainAccount = this.mainAccounts[account];
    if (!mainAccount) return false;
    return mainAccount.account !== '' && mainAccount.block !== null;
  }

  mainAccountTxnLimited(account: string, now: number): boolean {
    const head = this.mainAccounts[account];
    if (!head) return true;
    return head.txnLimited(now);
  }

  mainAccountHeadHeight(account: string): U64 | undefined {
    const mainAccount = this.mainAccounts[account];
    if (!mainAccount) return undefined;
    return mainAccount.headHeight();
  }

  calcOrderActionStatus(order: OrderInfo, now: number): OrderActionStatus {
    if (!this.synced() || !order.active(now) || this.txnLimited(now) || this.swapLimited()
      || this.mainAccountTxnLimited(order.mainAccount, now)
      || !this.mainAccountSynced(order.mainAccount)) {
        return OrderActionStatus.DISABLE;
    }


    if (this.swapInfo.pong.plus(AppHelper.SWAP_PING_PONG_INTERVAL).gt(now)
          || (this.lastPing > 0 && this.swapInfo.pong.gt(this.lastPing - 10)
          && this.swapInfo.pong.gt(now - 300))) {
      return OrderActionStatus.TRADE;
    }

    if (this.lastPing + AppHelper.SWAP_PING_PONG_INTERVAL >= now) {
      return OrderActionStatus.PINGING;
    }

    if (this.swapInfo.pong.plus(AppHelper.SWAP_PING_PONG_INTERVAL).lte(now)
      && this.lastPing + AppHelper.SWAP_PING_PONG_INTERVAL < now) {
      return OrderActionStatus.PING;
    }

    return OrderActionStatus.DISABLE;
  }

  updateOrderStatus(now: number): boolean {
    let update = false;
    for (let i of this.orders) {
      const status = this.calcOrderActionStatus(i.order, now);
      if (status !== i.status) {
        update = true;
        i.status = status;
      }
    }
    return update;
  }
}

export class AccountHead {
  account: string = '';
  hash: U256 = U256.zero();
  block: any = null;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.hash = new U256(json.hash, 16);
      this.block = json.block;
      return false;
    }
    catch (e) {
      console.log(`AccountHead.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  headHeight(): U64 {
    if (!this.block) return new U64(0);
    return new U64(this.block.height);
  }

  txnLimited(now: number): boolean {
    if (!this.block) return true;
    const blockTimestamp = new U64(this.block.timestamp);
    if (!blockTimestamp.sameDay(now)) return false;
    return new U64(this.block.credit).mul(20).lte(this.block.counter);
  }
}

export enum OrderActionStatus {
  DISABLE = 'disable',
  PING = 'ping',
  PINGING = 'pinging',
  TRADE = 'trade',
}

export class MakerOrderInfo {
  order: OrderInfo = new OrderInfo();
  status: OrderActionStatus = OrderActionStatus.DISABLE;
}

class TakerInfo {
  account: string = '';
  swapInfo: AccountSwapInfo = new AccountSwapInfo();
  ref: number = 0;
  nextSyncAt: number = 0;
}

class TokenIdOwnerInfo {
  chain: string = '';
  address: string = '';
  tokenId: string = '';
  owner: string = '';

  // local data
  ref: number = 0;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  _topic: string = '';

  copyLocalData(info: TokenIdOwnerInfo) {
    this.ref = info.ref;
    this.nextSyncAt = info.nextSyncAt;
    this._topic = info._topic;
  }

  eq(other: TokenIdOwnerInfo) {
    return this.chain === other.chain && this.address === other.address && this.tokenId === other.tokenId;
  }

  fromJson(json: any): boolean {
    try {
      this.chain = json.chain;
      this.address = json.address;
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, new U256(json.address_raw, 16));
        if (ret.error) {
          console.log(`TokenIdOwnerInfo.fromJson: failed to parse json=${json}`);
          return true;
        }
        this.address = ret.address!;
      }
      this.tokenId = json.token_id;
      this.owner = json.owner;
      return false;
    }
    catch (e) {
      console.log(`TokenIdOwnerInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

  fromParams(token: TokenKey, tokenId: U256, owner: string = '') {
    this.chain = token.chain;
    this.address = token.address;
    this.tokenId = tokenId.toDec();
    this.owner = owner;
  }

  topic(): string {
    if (this._topic) return this._topic;
    const chain = ChainHelper.toChain(this.chain);
    if (chain === Chain.INVALID) {
      console.error(`TokenIdOwnerInfo.topic: invalid chain=${this.chain}`);
      return '';
    }
    const ret = ChainHelper.addressToRaw(this.chain, this.address);
    if (ret.error) {
      console.error(`TokenIdOwnerInfo.calcTopic: failed to convert address to raw, address=${this.address}`);
      return '';
    }

    const topic = AppHelper.calcTopic(AppTopicType.TOKEN_ID_OWNER, new U32(chain), ret.raw!,
      new U256(this.tokenId));
    this._topic = topic.toHex();
    return this._topic;
  }

}

export interface SwapProcessResult {
  returnCode: SwapReturnCode;
  walletOpResult?: WalletOpResult;
  mainAccountError?: boolean
  mainAccount?: string;
}

export enum SwapReturnCode {
  SUCCESS = 0,
  WAITING = 1,
  SKIPPED = 2,
  FAILED  = 3,
}

export class MapInfo {
  account: string = '';
  height: number = 0;
  index: number = 0;
  chain: string = '';
  chainId: number = 0;
  address: string = '';
  addressRaw: U256 = U256.zero();
  type: TokenType = TokenType.INVALID;
  decimals: number | undefined = undefined;
  value: U256 = U256.zero();
  from: string = '';
  to: string = '';
  sourceTxn: string = '';
  targetTxn: string = '';
  targetTimestamp?: number;

  // local data
  confirmed: boolean = false;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.height = +json.height;
      this.index = +json.index;
      this.chain = json.chain;
      this.chainId = +json.chain_id;
      if (!this.chain) {
        this.chain = ChainHelper.toChainStr(this.chainId as Chain)
      }
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`MapInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
      this.type = TokenHelper.toType(json.type);
      if (json.decimals !== undefined) {
        this.decimals = +json.decimals;
      }
      this.value = new U256(json.value);
      const retAddress = ChainHelper.rawToAddress(this.chain, json.from_raw);
      if (retAddress.error || !retAddress.address) return true;
      this.from = retAddress.address;
      this.to = json.to;
      this.sourceTxn = ZX + json.source_transaction.toLowerCase();
      if (json.target_transaction !== Z64) {
        this.targetTxn = json.target_transaction;
      }
      if (json.target_block) {
        this.targetTimestamp = +json.target_block.timestamp;
      }
      return false;
    }
    catch (e) {
      console.log(`MapInfo.fromJson: failed to parse json=`, json, `exception=`, e);
      return true;
    }
  }

  gt(other: MapInfo): boolean {
    if (this.height !== other.height) {
      return this.height > other.height;
    }
    if (this.index !== other.index) {
      return this.index > other.index;
    }
    return false;
  }

  lt(other: MapInfo): boolean {
    if (this.height !== other.height) {
      return this.height < other.height;
    }
    if (this.index !== other.index) {
      return this.index < other.index;
    }
    return false;
  }

  le(other: MapInfo): boolean {
    return this.lt(other) || this.eq(other);
  }

  eq(other: MapInfo): boolean {
    return this.height === other.height && this.index === other.index;
  }

  completed(): boolean {
    return !!this.targetTxn;
  }

  sameWith(other: MapInfo): boolean {
    return this.eq(other) && this.sourceTxn === other.sourceTxn
      && this.confirmed === other.confirmed && this.targetTxn == other.targetTxn;
  }

}

export class AccountTokenMapInfos {
  maps: MapInfo[] = [];
  more: boolean = true;

  // local data
  expectedRecentMaps: number = 10;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  synced: boolean = false;
  confirmedHead: MapInfo | undefined;
  confirmedTail: MapInfo | undefined;

  purgePendings() {
    const index = this.indexOfConfirmed();
    if (index < 0) return;
    this.maps.splice(0, index);
  }

  indexOfConfirmed(): number {
    return this.maps.findIndex(x => x.confirmed);
  }

  // return inserted
  insert(map: MapInfo): boolean {
    if (this.confirmedHead) {
      if (!map.confirmed && map.le(this.confirmedHead)) return false;
    }

    let index = this.maps.findIndex(x => x.eq(map));
    if (index >= 0) {
      const existing = this.maps[index];
      if (existing.sameWith(map) || existing.completed()) return false;
      this.maps.splice(index, 1);
    }
    index = this.maps.findIndex(x => x.lt(map));
    if (index < 0) {
      this.maps.push(map);
    } else {
      this.maps.splice(index, 0, map);
    }
    if (!map.confirmed) return true;
    
    if (!this.confirmedHead || map.gt(this.confirmedHead)) {
      this.confirmedHead = map;
    }
    if (!this.confirmedTail || map.lt(this.confirmedTail)) {
      this.confirmedTail = map;
    }
    return true;
  }
}

export class UnmapInfo {
  account: string = '';
  height: number = 0;
  chain: string = '';
  chainId: number = 0;
  address: string = '';
  addressRaw: U256 = U256.zero();
  type: TokenType = TokenType.INVALID;
  decimals: number | undefined = undefined;
  value: U256 = U256.zero();
  from: string = '';
  fromRaw: U256 = U256.zero();
  to: string = '';
  toRaw: U256 = U256.zero();
  sourceTxn: string = '';
  sourceTimestamp: number = 0;
  sourceBlock: any = null;
  extraData: U64 = U64.zero();
  targetConfirmed: boolean = false;
  targetTxn: string = '';
  targetHeight: U64 = U64.zero();
  targetIndex: number = 0;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.height = +json.height;
      this.chain = json.chain;
      this.chainId = +json.chain_id;
      if (!this.chain) {
        this.chain = ChainHelper.toChainStr(this.chainId as Chain)
      }
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`UnmapInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
      this.type = TokenHelper.toType(json.type);
      if (json.decimals !== undefined) {
        this.decimals = +json.decimals;
      }
      this.value = new U256(json.value);
      this.fromRaw = new U256(json.from_raw, 16);
      this.from = json.from;
      if (!this.from) {
        this.from = this.fromRaw.toAccountAddress();
      }
      this.toRaw = new U256(json.to_raw, 16);
      this.to = json.to;
      if (!this.to) {
        const retAddress = ChainHelper.rawToAddress(this.chain, this.toRaw);
        if (retAddress.error || !retAddress.address) return true;
        this.to = retAddress.address;  
      }
      this.sourceTxn = json.source_transaction;
      this.sourceTimestamp = +json.source_block.timestamp;
      this.extraData = new U64(json.extra_data);
      this.targetConfirmed = json.target_confirmed === 'true';
      if (json.target_transaction !== Z64) {
        this.targetTxn = ZX + json.target_transaction.toLowerCase();
      }
      this.targetHeight = new U64(json.target_height);
      this.targetIndex = +json.target_index;
      return false;
    }
    catch (e) {
      console.log(`UnmapInfo.fromJson: failed to parse json=`, json);
      return true;
    }
  }

  targetValid(): boolean {
    return !!this.targetTxn;
  }

  newerThan(other: UnmapInfo): boolean {
    if (this.targetConfirmed !== other.targetConfirmed) {
      return this.targetConfirmed;
    }
    if (this.targetValid() !== other.targetValid()) {
      return this.targetValid();
    }
    return false;
  }

}

export class AccountTokenUnmapInfos {
  unmaps: UnmapInfo[] = [];
  more: boolean = true;

  // local data
  expectedRecentUnmaps: number = 10;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  synced: boolean = false;

  head(): UnmapInfo | undefined {
    if (this.unmaps.length === 0) return undefined;
    return this.unmaps[0];
  }

  tail(): UnmapInfo | undefined {
    const length = this.unmaps.length;
    if (length === 0) return undefined;
    return this.unmaps[length - 1];
  }

  pendingTail(): UnmapInfo | undefined {
    for (let index = this.unmaps.length - 1; index >= 0; --index) {
      if (!this.unmaps[index].targetConfirmed) {
        return this.unmaps[index];
      }
    }
    return undefined;
  }

  size(): number {
    return this.unmaps.length;
  }

  // return existing
  insert(unmap: UnmapInfo): boolean {
    let existing = false;
    let index = this.unmaps.findIndex(x => x.height === unmap.height);
    if (index >= 0) {
      existing = true;
      if (!unmap.newerThan(this.unmaps[index])) return existing;
      this.unmaps.splice(index, 1);
    }
    index = this.unmaps.findIndex(x => x.height < unmap.height);
    if (index < 0) {
      this.unmaps.push(unmap);
    } else {
      this.unmaps.splice(index, 0, unmap);
    }
    return existing;
  }
}

export class WrapInfo {
  account: string = '';
  height: number = 0;
  chain: string = '';
  chainId: number = 0;
  address: string = '';
  addressRaw: U256 = U256.zero();
  type: TokenType = TokenType.INVALID;
  decimals: number | undefined = undefined;
  value: U256 = U256.zero();
  from: string = '';
  fromRaw: U256 = U256.zero();
  toChain: string = '';
  toChainId: number = 0;
  toAccount: string = '';
  toAccountRaw: U256 = U256.zero();
  sourceTxn: string = '';
  sourceTimestamp: number = 0;
  sourceBlock: any = null;
  targetConfirmed: boolean = false;
  targetTxn: string = '';
  targetHeight: U64 = U64.zero();
  targetIndex: number = 0;
  wrappedAddress: string = '';
  wrappedAddressRaw: U256 = U256.zero();

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.height = +json.height;
      this.chain = json.chain;
      this.chainId = +json.chain_id;
      if (!this.chain) {
        this.chain = ChainHelper.toChainStr(this.chainId as Chain)
      }
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`WrapInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
      this.type = TokenHelper.toType(json.type);
      if (json.decimals !== undefined) {
        this.decimals = +json.decimals;
      }
      this.value = new U256(json.value);
      this.fromRaw = new U256(json.from_raw, 16);
      this.from = json.from;
      if (!this.from) {
        this.from = this.fromRaw.toAccountAddress();
      }
      this.toChain = json.to_chain;
      this.toChainId = +json.to_chain_id;
      if (!this.toChain) {
        this.toChain = ChainHelper.toChainStr(this.toChainId as Chain)
      }
      this.toAccountRaw = new U256(json.to_account_raw, 16);
      this.toAccount = json.to_account;
      if (!this.toAccount) {
        const ret = ChainHelper.rawToAddress(this.toChain, this.toAccountRaw);
        if (ret.error || !ret.address) return true;
        this.toAccount = ret.address;  
      }
      this.sourceTxn = json.source_transaction;
      this.sourceTimestamp = +json.source_block.timestamp;
      this.targetConfirmed = json.target_confirmed === 'true';
      if (json.target_transaction !== Z64) {
        this.targetTxn = ZX + json.target_transaction.toLowerCase();
      }
      this.targetHeight = new U64(json.target_height);
      this.targetIndex = +json.target_index;
      this.wrappedAddress = json.wrapped_address;
      this.wrappedAddressRaw = new U256(json.wrapped_address_raw, 16);
      if (!this.wrappedAddress) {
        const ret = ChainHelper.rawToAddress(this.toChain, this.wrappedAddressRaw);
        if (ret.error) {
          console.error(`WrapInfo.fromJson: convert raw to address failed, chain: ${this.toChain}, raw: ${this.wrappedAddressRaw.toHex()}`);
          return true;
        }
        this.wrappedAddress = ret.address!;
      }
      return false;
    }
    catch (e) {
      console.log(`WrapInfo.fromJson: failed to parse json=`, json);
      return true;
    }
  }

  targetValid(): boolean {
    return !!this.targetTxn;
  }

  newerThan(other: WrapInfo): boolean {
    if (this.targetConfirmed !== other.targetConfirmed) {
      return this.targetConfirmed;
    }
    if (this.targetValid() !== other.targetValid()) {
      return this.targetValid();
    }
    return false;
  }
}

export class AccountTokenWrapInfos {
  wraps: WrapInfo[] = [];
  more: boolean = true;

  // local data
  expectedRecentWraps: number = 10;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  synced: boolean = false;

  head(): WrapInfo | undefined {
    if (this.wraps.length === 0) return undefined;
    return this.wraps[0];
  }

  tail(): WrapInfo | undefined {
    const length = this.wraps.length;
    if (length === 0) return undefined;
    return this.wraps[length - 1];
  }

  pendingTail(): WrapInfo | undefined {
    for (let index = this.wraps.length - 1; index >= 0; --index) {
      if (!this.wraps[index].targetConfirmed) {
        return this.wraps[index];
      }
    }
    return undefined;
  }

  size(): number {
    return this.wraps.length;
  }

  // return existing
  insert(wrap: WrapInfo): boolean {
    let existing = false;
    let index = this.wraps.findIndex(x => x.height === wrap.height);
    if (index >= 0) {
      existing = true;
      if (!wrap.newerThan(this.wraps[index])) return existing;
      this.wraps.splice(index, 1);
    }
    index = this.wraps.findIndex(x => x.height < wrap.height);
    if (index < 0) {
      this.wraps.push(wrap);
    } else {
      this.wraps.splice(index, 0, wrap);
    }
    return existing;
  }
}

export class UnwrapInfo {
  account: string = '';
  height: number = 0;
  index: number = 0;
  chain: string = '';
  chainId: number = 0;
  address: string = '';
  addressRaw: U256 = U256.zero();
  type: TokenType = TokenType.INVALID;
  decimals: number | undefined = undefined;
  value: U256 = U256.zero();
  fromChain: string = '';
  fromChainId: number = 0;
  fromAccount: string = '';
  fromAccountRaw: U256 = U256.zero();
  to: string = '';
  toRaw: U256 = U256.zero();
  sourceTxn: string = '';
  wrappedAddress: string = '';
  wrappedAddressRaw: U256 = U256.zero();
  targetTxn: string = '';
  targetTimestamp?: number;

  // local data
  confirmed: boolean = false;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.height = +json.height;
      this.index = +json.index;
      this.chain = json.chain;
      this.chainId = +json.chain_id;
      if (!this.chain) {
        this.chain = ChainHelper.toChainStr(this.chainId as Chain)
      }
      this.address = json.address;
      this.addressRaw = new U256(json.address_raw, 16);
      if (!this.address) {
        const ret = ChainHelper.rawToAddress(this.chain, this.addressRaw);
        if (ret.error) {
          console.error(`UnwrapInfo.fromJson: convert raw to address failed, chain: ${this.chain}, raw: ${this.addressRaw.toHex()}`);
          return true;
        }
        this.address = ret.address!;
      }
      this.type = TokenHelper.toType(json.type);
      if (json.decimals !== undefined) {
        this.decimals = +json.decimals;
      }
      this.value = new U256(json.value);
      this.fromChain = json.from_chain;
      this.fromChainId = +json.from_chain_id;
      if (!this.fromChain) {
        this.fromChain = ChainHelper.toChainStr(this.fromChainId as Chain)
      }
      this.fromAccountRaw = new U256(json.from_account_raw, 16);
      this.fromAccount = json.from_account;
      if (!this.fromAccount) {
        const ret = ChainHelper.rawToAddress(this.fromChain, this.fromAccountRaw);
        if (ret.error || !ret.address) return true;
        this.fromAccount = ret.address;  
      }
      this.toRaw = new U256(json.to_raw, 16);
      this.to = json.to;
      if (!this.to) {
        this.to = this.toRaw.toAccountAddress();
      }
      this.sourceTxn = ZX + json.source_transaction.toLowerCase();
      this.wrappedAddress = json.wrapped_address;
      this.wrappedAddressRaw = new U256(json.wrapped_address_raw, 16);
      if (!this.wrappedAddress) {
        const ret = ChainHelper.rawToAddress(this.fromChain, this.wrappedAddressRaw);
        if (ret.error) {
          console.error(`UnwrapInfo.fromJson: convert raw to address failed, chain: ${this.fromChain}, raw: ${this.wrappedAddressRaw.toHex()}`);
          return true;
        }
        this.wrappedAddress = ret.address!;
      }
      if (json.target_transaction !== Z64) {
        this.targetTxn = json.target_transaction;
      }
      if (json.target_block) {
        this.targetTimestamp = +json.target_block.timestamp;
      }
      return false;
    }
    catch (e) {
      console.log(`UnwrapInfo.fromJson: failed to parse json=`, json, `exception=`, e);
      return true;
    }
  }

  gt(other: UnwrapInfo): boolean {
    if (this.height !== other.height) {
      return this.height > other.height;
    }
    if (this.index !== other.index) {
      return this.index > other.index;
    }
    return false;
  }

  lt(other: UnwrapInfo): boolean {
    if (this.height !== other.height) {
      return this.height < other.height;
    }
    if (this.index !== other.index) {
      return this.index < other.index;
    }
    return false;
  }

  le(other: UnwrapInfo): boolean {
    return this.lt(other) || this.eq(other);
  }

  eq(other: UnwrapInfo): boolean {
    return this.height === other.height && this.index === other.index;
  }

  completed(): boolean {
    return !!this.targetTxn;
  }

  sameWith(other: UnwrapInfo): boolean {
    return this.eq(other) && this.sourceTxn === other.sourceTxn
      && this.confirmed === other.confirmed && this.targetTxn === other.targetTxn;
  }

}

export class AccountTokenUnwrapInfos {
  unwraps: UnwrapInfo[] = [];
  more: boolean = true;

  // local data
  expectedRecentUnwraps: number = 10;
  nextSyncAt: number = 0;
  lastSyncAt: number = -1000000;
  synced: boolean = false;
  confirmedHead: UnwrapInfo | undefined;
  confirmedTail: UnwrapInfo | undefined;

  purgePendings() {
    const index = this.indexOfConfirmed();
    if (index < 0) return;
    this.unwraps.splice(0, index);
  }

  indexOfConfirmed(): number {
    return this.unwraps.findIndex(x => x.confirmed);
  }

  // return inserted
  insert(unwrap: UnwrapInfo): boolean {
    if (this.confirmedHead) {
      if (!unwrap.confirmed && unwrap.le(this.confirmedHead)) return false;
    }

    let index = this.unwraps.findIndex(x => x.eq(unwrap));
    if (index >= 0) {
      const existing = this.unwraps[index];
      if (existing.sameWith(unwrap) || existing.completed()) return false;
      this.unwraps.splice(index, 1);
    }
    index = this.unwraps.findIndex(x => x.lt(unwrap));
    if (index < 0) {
      this.unwraps.push(unwrap);
    } else {
      this.unwraps.splice(index, 0, unwrap);
    }
    if (!unwrap.confirmed) return true;
    
    if (!this.confirmedHead || unwrap.gt(this.confirmedHead)) {
      this.confirmedHead = unwrap;
    }
    if (!this.confirmedTail || unwrap.lt(this.confirmedTail)) {
      this.confirmedTail = unwrap;
    }
    return true;
  }
}