import { Injectable, OnDestroy } from '@angular/core';
import { ServerService, ServerState } from './server.service';
import { WalletsService, WalletOpResult, WalletErrorCode, Account, Wallet } from './wallets.service';
import { U64, U256, TokenType, U8, TokenHelper, U32, ChainHelper, Chain, ChainStr, ExtensionTypeStr, TokenTypeStr, ExtensionTokenOpStr, U16, TokenSwapSubOpStr, U512 } from './util.service';
import { environment } from '../../environments/environment';
import { Subject } from 'rxjs';
import { SettingsService } from './settings.service';
import { LogoService } from './logo.service';

@Injectable({
  providedIn: 'root'
})
export class TokenService implements OnDestroy {
  private SERVICE = 'token';
  private INVALID_ACCOUNT = new U256(0).toAccountAddress();
  private accounts: {[account: string]: AccountTokensInfo} = {};
  private tokenBlocks: {[accountHeight: string]: TokenBlock} = {};
  private tokenInfos: {[chainAddress: string]: TokenInfo} = {};
  private maxTokenIds: {[account: string]: MaxTokenId} = {};
  private receivings: {[key: string]: boolean} = {};
  private timerSync: any = null;
  private issuerSubject = new Subject<{account: string, created: boolean}>();
  private tokenIdSubject = new Subject<{ chain: string, address: string, id: U256, existing: boolean }>();
  private accountSyncedSubject = new Subject<{account: string, synced: boolean}>();
  private tokenInfoSubject = new Subject<{ chain: string, address: string, existing: boolean,
                                           info?: TokenInfo }>();
  private accountSwapInfoSubject = new Subject<AccountSwapInfo>();
  private orderInfoSubject = new Subject<OrderInfo>();

  public issuer$ = this.issuerSubject.asObservable();
  public tokenId$ = this.tokenIdSubject.asObservable();
  public accountSynced$ = this.accountSyncedSubject.asObservable();
  public tokenInfo$ = this.tokenInfoSubject.asObservable();
  public accountSwapInfo$ = this.accountSwapInfoSubject.asObservable();
  public orderInfo$ = this.orderInfoSubject.asObservable();

  constructor(
    private server: ServerService,
    private wallets: WalletsService,
    private settings: SettingsService,
    private logo: LogoService
  ) {
    this.server.state$.subscribe(state => this.processServerState(state));
    this.server.message$.subscribe(message => this.processMessage(message));
    this.timerSync = setInterval(() => this.ongoingSync(), 1000);
    this.wallets.addAccount$.subscribe(address => this.addAccount(address));
    this.wallets.forEachAccount(account => this.addAccount(account.address()));
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

  accountTokenInfo(chain: string, address: string, account?: string)
   : AccountTokenInfo | undefined {
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

  balance(chain: string, address: string, account?: string): U256 {
    if (!account) account = this.wallets.selectedAccountAddress();
    const info = this.accounts[account];
    if (!info) return new U256(0);
    for (let i of info.tokens) {
      if (i.chain === chain && i.address === address) {
        return i.balance;
      }
    }
    return new U256(0);
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

  receivables(account?: string): TokenReceivable[] {
    if (!account) account = this.wallets.selectedAccountAddress();
    if (!this.accounts[account]) return [];
    return this.accounts[account].receivables;
  }

  receivablesQuery(account: string) {
    this.queryTokenReceivablesSummary(account);
  }

  change(address: string, extensions: {[key: string]: any}[], wallet?: Wallet): WalletOpResult  {
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;
    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP };
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
    return this.wallets.changeExtensions(extensions, account, wallet);
  }

  receive(address: string, key: string, account?: Account, wallet?: Wallet): WalletOpResult {
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;
    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP };
    }

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
    const result = this.wallets.changeExtensions(extensions, account, wallet);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      return result;
    }

    this.receivings[receivable.key()] = true;
    info.receivables.splice(index, 1);
    return result;
  }

  setMainAccount(address: string, mainAccount: string, wallet?: Wallet): WalletOpResult {
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;

    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP };
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
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;

    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP };
    }

    if (info.orderLimited()) {
      return { errorCode: WalletErrorCode.CREDIT }
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
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;

    const order = info.getOrder(height);
    if (!order || order.order.finished()) return ignored;

    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP }
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
      sub_op: TokenSwapSubOpStr.CANCEL,
      order_height: height.toDec()
    };

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    return this.wallets.changeExtensions(extensions, account, wallet);
  }

  swapInquiry(address: string, value: {[key: string]: string}, wallet?: Wallet): WalletOpResult {
    const ignored = { errorCode: WalletErrorCode.IGNORED };
    const info = this.accounts[address];
    if (!info) return ignored;

    if (info.swapping()) {
      return { errorCode: WalletErrorCode.PENDING_SWAP };
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
    value.sub_op = TokenSwapSubOpStr.INQUIRY;

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    return this.wallets.changeExtensions(extensions, account, wallet);
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

  orderCancelling(account: string, height: U64): boolean {
    const info = this.accounts[account];
    if (!info) return false;
    return info.orderCancelling(height);
  }

  swapping(account: string): boolean {
    const info = this.accounts[account];
    if (!info) return false;
    return info.swapping();
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
      this.querySyncInfo(address);
      this.queryAccountTokensInfo(address);
      this.queryTokenInfo(environment.current_chain, address);
      this.queryAccountSwapInfo(address);
      this.querySwapMainAccount(address);
      this.queryAccountActiveSwaps(address);
      this.syncAccountOrders(address);
      // todo:

      if (info.subscribed && info.swapMainAccountQueried && info.swapInfoQueried) {
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

  queryTokenInfo(chain: string, address: string | U256) {
    const message: any = {
      action: 'token_info',
      service: this.SERVICE,
      chain
    };
    if (address instanceof U256) {
      message.address_raw = address.toHex();
    } else {
      message.address = address;
      const ret = ChainHelper.addressToRaw(chain, address);
      if (ret.error) { 
        console.error(`queryTokenInfo: convert address to raw failed, chain=${chain}, address=${address}`);
        return;
      }
      message.address_raw = ret.raw!.toHex();
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
        case 'account_active_swaps':
          this.processAccountActiveSwapsAck(message);
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
        case 'next_account_token_links':
          this.processAccountTokenLinksQueryAck(message, false);
          break;
        case 'next_token_blocks':
          this.processTokenBlocksQueryAck(message, false);
          break;
        case 'order_swaps':
          this.processOrderSwapsAck(message);
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
        case 'token_block':
          this.processTokenBlockQueryAck(message);
          break;
        case 'token_info':
          this.processTokenInfoQueryAck(message);
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
        default:
          break;
      }
    }
    else if (message.notify) {
      switch (message.notify) {
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
          this.processOrderInfoNotify(message);
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
        case 'token_id_transfer':
          this.processTokenIdTransferNotify(message);
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

  private processAccountActiveSwapsAck(message: any) {
    if (message.error || !message.swaps) return;
    const now = this.server.getTimestamp();
    for (let i of message.swaps) {
      let swap : SwapFullInfo | null = new SwapFullInfo();
      const error = swap.fromJson(i);
      if (error) continue;
      const taker = swap.swap.taker;
      const maker = swap.order.maker.account;
      let info = this.accounts[taker];
      if (info) {
        info.updateActiveSwap(swap, now);
        swap = null;
      }
      info = this.accounts[maker];
      if (info) {
        if (!swap) {
          swap = new SwapFullInfo();
          swap.fromJson(i);
        }
        info.updateActiveSwap(swap, now);
      }
    }
  }

  private processAccountOrdersAck(message: any) {
    if (!message.account || message.error || !message.more) return;
    const info = this.accounts[message.account];
    if (!info) return;
    info.moreOrders = message.more === 'true';
    if (!message.orders) return;

    let sort = false;
    let existing = false;
    let minOrderHeight = U64.max();
    for (let i of message.orders) {
      const order = new OrderInfo();
      const error = order.fromJson(i);
      if (error) continue;
      existing = info.updateOrder(order, false);
      this.orderInfoSubject.next(order);
      if (!existing) {
        this.queryOrderSwaps(message.account, order.orderHeight)
      }
      sort = true;
      if (order.orderHeight.lt(minOrderHeight)) {
        minOrderHeight = order.orderHeight;
      }
    }

    if (sort) info.sortOrders();

    if (existing /* The last order exists */ || minOrderHeight.eq(info.minOrderHeight)) {
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
        this.queryAccountTokensInfo(account);
        setTimeout(() => {
          token.tokenIds = [];
          this.syncAccountTokenIds(account, token);
        }, 1000);
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

  private processOrderInfoNotify(message: any) {
    const order = new OrderInfo();
    const error = order.fromJson(message);
    if (error) return;
    const account = order.maker.account;
    const info = this.accounts[account];
    if (!info) return;
    info.updateOrder(order);
    this.orderInfoSubject.next(order);
  }

  private processSwapInfoNotify(message: any) {
    const swap = new SwapFullInfo();
    const error = swap.fromJson(message);
    if (error) return;

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

    // todo:
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
    if (!beginId) beginId = new U256(0);
    const message: any = {
      action: 'account_token_ids',
      service: this.SERVICE,
      account,
      chain,
      address,
      count: `${count}`,
      begin_id: beginId.toDec()
    };
    this.server.send(message);
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

  private queryTokenIdInfo(address: string, id: U256, chain?: string) {
    if (!chain) chain = environment.current_chain;
    const message: any = {
      action: 'token_id_info',
      service: this.SERVICE,
      chain,
      address: address,
      token_id: id.toDec()
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
    return this.logo.hasLogo(chain, address);
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

  tokenBlockLinks: TokenBlockLinks = new TokenBlockLinks();


  //local data
  expectedRecentBlocks: number = 10;
  expectedRecentOrders: number = 10;

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

  updateOrder(order: OrderInfo, sort?: boolean): boolean {
    if (typeof sort === 'undefined') sort = true;
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

  updateActiveSwap(swap: SwapFullInfo, timestamp: number) {
    const index = this.activeSwaps.findIndex(x => x.eq(swap));
    if (index === -1) {
      if (this.activeSwaps[index].swap.finished()) return;
      swap.copyLocalData(this.activeSwaps[index]);
      swap.last_update = timestamp;
      this.activeSwaps[index] = swap;
    } else {
      if (swap.swap.finished()) return;
      swap.last_update = timestamp;
      this.activeSwaps.push(swap);
    }
  }

  purgeActiveSwaps(cutoff: number) {
    // todo:
    this.activeSwaps = this.activeSwaps.filter(x => x.last_update >= cutoff || !x.swap.finished());
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
    // todo: set cancelSent flag
  }

  swapping(): boolean {
    const index = this.activeSwaps.findIndex(x => {
      if (x.swap.maker !== this.address) return false;
      if (x.swap.status === SwapStatus.INQUIRY_ACK || x.swap.status === SwapStatus.TAKE) return true;
      return false;
    });
    return index !== -1;
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

class MaxTokenId { 
  id: U256 = new U256();
  valid: boolean = false;
}

export class AccountSwapInfo {
  account: string = '';
  activeOrders: U64 = new U64(0);
  totalOrders: U64 = new U64(0);
  activeSwaps: U64 = new U64(0);
  totalSwaps: U64 = new U64(0);
  credit: U16 = new U16(0);
  limited: boolean = false;

  fromJson(json: any): boolean {
    try {
      this.account = json.account;
      this.activeOrders = new U64(json.active_orders);
      this.totalOrders = new U64(json.total_orders);
      this.activeSwaps = new U64(json.active_swaps);
      this.totalSwaps = new U64(json.total_swaps);
      this.credit = new U16(json.credit);
      this.limited = json.limited === 'true';
      return false;
    }
    catch (e) {
      console.log(`AccountSwapInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }

}

export class TokenKey {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256(0);
  type: string = '';

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

}

export class OrderInfo {
  maker: AccountSwapInfo = new AccountSwapInfo();
  orderHeight: U64 = U64.max();
  mainAccount: string = '';
  tokenOffer: TokenKey = new  TokenKey();
  tokenWant: TokenKey = new TokenKey();
  valueOffer: U256 = new U256(0);
  valueWant: U256 = new U256(0);
  minOffer: U256 = new U256(0);
  maxOffer: U256 = new U256(0);
  leftOffer: U256 = new U256(0);
  timeout: U64 = new U64(0);
  finishedBy: string = '';
  finishedHeight: U64 = U64.max();
  hash: U256 = new U256(0);
  createdAt: U64 = new U64(0);

  eq(other: OrderInfo): boolean {
    return this.hash.eq(other.hash);
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

  finished(): boolean {
    return this.finishedBy === 'cancel' || this.finishedBy === 'fulfill';
  }

  fulfilled(): boolean {
    return this.finishedBy === 'fulfill';
  }

  cancelled(): boolean {
    return this.finishedBy === 'cancel';
  }

  fungiblePair(): boolean {
    return this.tokenOffer.type === TokenTypeStr._20 && this.tokenWant.type === TokenTypeStr._20;
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
  orderHeight: U64 = new U64(0);
  taker: string = '';
  inquiryHeight: U64 = new U64(0);
  inquiryAckHeight: U64 = new U64(0);
  takeHeight: U64 = new U64(0);
  tradeHeight: U64 = new U64(0);
  timeout: U64 = new U64(0);
  value: U256 = new U256(0);
  takerShare: U256 = new U256(0);
  makerShare: U256 = new U256(0);
  makerSignature: U512 = new U512(0);
  tradePrevious: U256 = new U256(0);

  success(): boolean {
    return this.status === SwapStatus.TAKE_ACK;
  }

  finished(): boolean {
    return this.status === SwapStatus.INQUIRY_NACK || this.status === SwapStatus.TAKE_ACK
      || this.status === SwapStatus.TAKE_NACK;
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
      return false;
    }
    catch (e) {
      console.log(`SwapInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}

export class OrderSwapInfo {
  order: OrderInfo = new OrderInfo();
  swaps: SwapInfo[] = [];

  //local data
  expectedRecentSwaps: number = 10;
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
  makerBalance: U256 = new U256(0);
  takerBalance: U256 = new U256(0);

  // local data
  last_update: number = 0;
  inquiry_ack_sent: boolean = false;
  take_sent: boolean = false;
  take_ack_sent: boolean = false;
  take_nack_block_status: string = TakeNackBlockStatus.INIT;

  eq(other: SwapFullInfo): boolean {
    return this.swap.taker === other.swap.taker
      && this.swap.inquiryHeight.eq(other.swap.inquiryHeight);
  }

  copyLocalData(other: SwapFullInfo) {
    this.last_update = other.last_update;
    this.inquiry_ack_sent = other.inquiry_ack_sent;
    this.take_sent = other.take_sent;
    this.take_ack_sent = other.take_ack_sent;
    this.take_nack_block_status = other.take_nack_block_status;
  }

  fromJson(json: any): boolean {
    try {
      let error = this.order.fromJson(json.order);
      if (error) return true;
      error = this.taker.fromJson(json.taker);
      if (error) return true;
      error = this.swap.fromJson(json);
      if (error) return true;
      this.makerBalance = new U256(json.maker_balance.balance);
      this.takerBalance = new U256(json.taker_balance.balance);
      return false;
    }
    catch (e) {
      console.log(`SwapFullInfo.fromJson: failed to parse json=${json}`);
      return true;
    }
  }
}