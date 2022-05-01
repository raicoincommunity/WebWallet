import { Component, OnInit, ViewChild, HostListener, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subject} from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { U256, TokenTypeStr, U512, U8, U64, ChainHelper, TokenHelper, AppHelper } from '../../services/util.service';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { NotificationService } from '../../services/notification.service';
import { AssetWidgetComponent } from '../asset-widget/asset-widget.component';
import { BigNumber } from 'bignumber.js';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { OrderSwapInfo, TokenService, OrderInfo, TokenKey, SearchLimitBy, SwapInfo, AccountSwapInfo, OrderActionStatus } from '../../services/token.service';
import { ServerService } from '../../services/server.service'
import { VerifiedTokensService } from '../../services/verified-tokens.service';

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class P2pComponent implements OnInit {
  @ViewChild('searchFromTokenWidget') searchFromTokenWidget! : TokenWidgetComponent;
  @ViewChild('searchToTokenWidget') searchToTokenWidget! : TokenWidgetComponent;
  @ViewChild('placeToTokenWidget') placeToTokenWidget! : TokenWidgetComponent;
  @ViewChild('placeAssetWidget') placeAssetWidget! : AssetWidgetComponent;

  // search orders
  activePanel = '';
  selectedSearchBy = SearchByOption.PAIR;
  selectedFilterBy = FilterByOption.TO_TOKEN;
  inputSearchOrderId = '';
  inputSearchFilterAmount = '';
  inputSearchFilterId = '';
  searchOrderCollapsed = false;
  searchFilterAmountStatus = 0;
  searchFilterIdStatus = 0;
  private searchFilterAmount = new U256(0);
  private searchFilterId = new U256(0);


  searchingBy: SearchByOption | undefined;
  searchingOrderId: U256 | undefined;
  searchingFromToken: TokenKey | undefined;
  searchingToToken: TokenKey | undefined;
  searchingLimitBy: SearchLimitBy | undefined;
  searchingLimitValue: U256 | undefined;
  searchingMore: boolean = false;
  searchingExpectedResults: number = 10;
  searchResults: OrderInfo[] = [];
  searchStatus: SearchStatus = SearchStatus.INIT;

  
  // place order
  priceInputText = '';
  priceStatus = 0;
  targetTokenAmountInputText = '';
  targetTokenAmountSatus = 0;
  targetTokenIdInputText = '';
  targetTokenIdStatus = 0;
  placeOrderCollapsed = false;

  selectedMinTrade = '10';
  minTradeOptions = [1, 2, 5, 10, 20, 50, 100];
  selectedExpire = '24';
  expireOptions = [1, 2, 4, 8, 12, 24, 2 * 24, 4 * 24, 7 * 24, 15 * 24, 30 * 24, 0]

  private priceBaseToggle = true;
  private priceBaseAmount = new U256(0);
  private priceQuoteAmount = new U256(0);
  private placeActualAmount = new U256(0);
  private placeActualTargetAmount = new U256(0);
  private targetTokenAmount = new U256(0);
  private targetTokenId = new U256(0);

  // selected order
  private selectedOrder: OrderInfo | undefined;

  private stopped: boolean = false;
  private searchSubscription: any;
  private orderSubscription: any;
  private accountOrdersSubscription: any;
  private makersSubscription: any;
  private accountSwapInfoSubscription: any = null;
  private refreshSubject = new Subject<number>();
  private refreshCount = 0;

  constructor(
    private notification: NotificationService,
    private wallets: WalletsService,
    private token: TokenService,
    private server: ServerService,
    private verified: VerifiedTokensService,
    private translate: TranslateService,
    private cdRef: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.orderSubscription = this.token.orderInfo$.subscribe(order => {
      if (this.stopped) return;
      let refresh = false;
      if (this.selectedOrder && this.selectedOrder.eq(order)) {
        this.selectedOrder = order;
        refresh = true;
      }
      
      const existing = this.searchResults.find(x => x.eq(order));
      if (existing) {
        this.updateSearchResults(order);
        refresh = true;
      }
      if (refresh) {
        this.refreshSubject.next(this.refreshCount++);
      }
    });

    this.searchSubscription = this.token.searchOrder$.subscribe(r => {
      if (this.stopped) return;
      if (r.by !== this.searchingBy) return;
      let more = false;
      if (r.by === SearchByOption.ID) {
        if (!r.hash || !this.searchingOrderId) return;
        if (!r.hash.eq(this.searchingOrderId)) return;
      } else if (r.by === SearchByOption.PAIR) { 
        if (!r.fromToken || !r.toToken || !this.searchingFromToken || !this.searchingToToken) 
        return;
        if (!r.fromToken.eq(this.searchingFromToken) || !r.toToken.eq(this.searchingToToken)) 
        return;
        if (r.limitBy !== this.searchingLimitBy) return;
        if (r.limitValue === this.searchingLimitValue) {
          // pass
        } else if (r.limitValue instanceof U256 && this.searchingLimitValue instanceof U256
          && r.limitValue.eq(this.searchingLimitValue)) {
          // pass
        } else {
          return;
        }
        more = r.more!;
      } else {
        return;
      }
      this.searchingMore = more;
      this.searchStatus = SearchStatus.SEARCHED;
      if (r.orders.length > 0) {
        for (let order of r.orders) {
          this.updateSearchResults(order, false);
        }
        this.sortSearchResults();
        this.searchMore(r.orders[r.orders.length - 1]);
      }
      this.refreshSubject.next(this.refreshCount++);
    });

    this.accountOrdersSubscription = this.token.accountOrders$.subscribe(account => {
      if (this.stopped) return;
      if (account !== this.address()) return;
      this.refreshSubject.next(this.refreshCount++);
    });

    this.makersSubscription = this.token.makers$.subscribe(() => {
      if (this.stopped) return;
      this.refreshSubject.next(this.refreshCount++);
    });

    this.accountSwapInfoSubscription = this.token.accountSwapInfo$.subscribe(() => {
      if (this.stopped) return;
      this.refreshSubject.next(this.refreshCount++);
    });

    this.refreshSubject.pipe(debounceTime(1000), distinctUntilChanged()).subscribe(
      _ => {
        this.cdRef.markForCheck();
      }
    );
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.orderSubscription) {
      this.orderSubscription.unsubscribe();
      this.orderSubscription = null;
    }
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
      this.searchSubscription = null;
    }
    this.unsubscribeSearchedOrders();
    this.searchResults = [];

    if (this.accountOrdersSubscription) {
      this.accountOrdersSubscription.unsubscribe();
      this.accountOrdersSubscription = null;
    }

    if (this.makersSubscription) {
      this.makersSubscription.unsubscribe();
      this.makersSubscription = null;
    }

    if (this.accountSwapInfoSubscription) {
      this.accountSwapInfoSubscription.unsubscribe();
      this.accountSwapInfoSubscription = null;
    }

    this.stopped = true;
  }

  unsubscribeSearchedOrders() {
    for (let order of this.searchResults) {
      this.token.unsubscribeOrder(order);
    }
  }

  onPlaceAssetChanged() {
    if (this.placeAssetWidget) {
      const asset = this.placeAssetWidget.selectedAsset;
      if (asset) {
        this.placeToTokenWidget.filtToken({chain: asset.chain, addressRaw: asset.addressRaw});
      } else {
        this.placeToTokenWidget.filtToken(undefined);
      }
    }
    this.syncPrice();
  }

  mainAccountSelected(): boolean {
    return this.wallets.mainAccountSelected();
  }

  shouldShowBackButton(): boolean {
    if (this.activePanel === Panel.PLACE_ORDER) return true;

    return false;
  }

  searchByOptions(): string[] {
    return ['id', 'pair'];
  }

  filterByOptions(): string[] {
    return [FilterByOption.TO_TOKEN, FilterByOption.FROM_TOKEN];
  }

  showSearchByOption(option: string): string {
    if (option === SearchByOption.ID) {
      let msg = marker(`Order ID`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else if (option == SearchByOption.PAIR) {
      let msg = marker(`Trading Pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      return '';
    }
  }

  showFilterByOption(option: string): string {
    if (option === FilterByOption.FROM_TOKEN) {
      let msg = marker(`Token you get`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else if (option == FilterByOption.TO_TOKEN) {
      let msg = marker(`Token you pay`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      return '';
    }
  }

  getFilterWidget(): TokenWidgetComponent | undefined {
    if (this.selectedFilterBy === FilterByOption.FROM_TOKEN) {
      return this.searchFromTokenWidget;
    } else if (this.selectedFilterBy === FilterByOption.TO_TOKEN) {
      return this.searchToTokenWidget;
    }
    return undefined;
  }

  searchFilterTokenType(): string {
    const widget = this.getFilterWidget();
    if (!widget) return '';

    const token = widget.selectedToken;
    if (!token) return '';

    return token.type;
  }

  searchFilterTokenFormat(): string {
    const widget = this.getFilterWidget();
    if (!widget) return '';
    const token = widget.selectedToken;
    if (!token) return '';
    return token.shortTextFormat();
  }

  syncSearchFilterAmount() {
    if (this.inputSearchFilterAmount === '') {
      this.searchFilterAmountStatus = 0;
      return;
    }

    const widget = this.getFilterWidget();
    if (!widget || !widget.selectedToken) {
      this.searchFilterAmountStatus = 0;
      return;
    }

    const token = widget.selectedToken;
    if (token.type != TokenTypeStr._20)
    {
      this.searchFilterAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(token.decimals);
      this.searchFilterAmount =
        new U256(new BigNumber(this.inputSearchFilterAmount).mul(decimalsValue));
      if (this.searchFilterAmount.eq(0)) {
        this.searchFilterAmountStatus = 2;
        return;
      }
      this.searchFilterAmountStatus = 1;
    }
    catch (err) {
      this.searchFilterAmountStatus = 2;
    }
  }


  syncSearchFilterId() {
    if (this.inputSearchFilterId === '') {
      this.searchFilterIdStatus = 0;
      return;
    }

    const widget = this.getFilterWidget();
    if (!widget || !widget.selectedToken) {
      this.searchFilterIdStatus = 0;
      return;
    }

    const token = widget.selectedToken;
    if (token.type != TokenTypeStr._721)
    {
      this.searchFilterIdStatus = 0;
      return;
    }

    try {
      this.searchFilterId = new U256(this.inputSearchFilterId);
      this.searchFilterIdStatus = 1;
    }
    catch (err) {
      this.searchFilterIdStatus = 2;
    }
  }

  onSearchTokenChange() {
    this.syncSearchFilterAmount();
    this.syncSearchFilterId();
  }

  onSearchFilterByChange() {
    this.syncSearchFilterAmount();
    this.syncSearchFilterId();
  }

  removeInputSearchOrderId() {
    this.inputSearchOrderId = '';
  }

  searchOrderIdStatus(): number {
    if (this.inputSearchOrderId === '') {
      return 0;
    }

    try {
      if (this.inputSearchOrderId.length != 64) {
        return 2;
      }

      const hash = new U256(this.inputSearchOrderId, 16);
      return 1; 
    } catch (err) {
      return 2;
    }
  }

  search() {
    if (this.selectedSearchBy === SearchByOption.ID) {
      try {
        const status = this.searchOrderIdStatus();
        if (status !== 1) throw new Error('');;
        const id = new U256(this.inputSearchOrderId, 16);
        this.token.searchOrderById(id);
        this.searchingOrderId = id;
        this.searchingBy = this.selectedSearchBy;
      } catch (err) {
        let msg = marker(`Please input a valid order ID`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else {
      if (!this.searchFromTokenWidget || !this.searchFromTokenWidget.selectedToken
        || !this.searchToTokenWidget || !this.searchToTokenWidget.selectedToken) {
        let msg = marker(`Please input the token pair`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }

      const fromToken = this.searchFromTokenWidget.selectedToken;
      const toToken = this.searchToTokenWidget.selectedToken;
      if (fromToken.chain === toToken.chain && fromToken.address === toToken.address) {
        let msg = marker(`Invalid token pair`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
      const fromTokenKey = new TokenKey();
      let error = fromTokenKey.fromParams(fromToken.chain, fromToken.addressRaw, fromToken.type);
      if (error) return;
      const toTokenKey = new TokenKey();
      error = toTokenKey.fromParams(toToken.chain, toToken.addressRaw, toToken.type);
      if (error) return;

      let limitToken;
      let limitBy;
      if (this.selectedFilterBy === FilterByOption.FROM_TOKEN) {
        limitToken = fromToken;
        limitBy = SearchLimitBy.FROM_TOKEN;
      } else if (this.selectedFilterBy === FilterByOption.TO_TOKEN) {
        limitToken = toToken;
        limitBy = SearchLimitBy.TO_TOKEN;
      } else {
        console.error(`search(): unexpected filter by option: ${this.selectedFilterBy}`);
        return;
      }

      let limitValue;
      if (limitToken.type === TokenTypeStr._20) {
        this.syncSearchFilterAmount();
        if (this.searchFilterAmountStatus === 2) {
          let msg = marker(`Please input a valid amount`);
          this.translate.get(msg).subscribe(res => msg = res);
          this.notification.sendError(msg);
          return;
        } else if (this.searchFilterAmountStatus === 1) {
          limitValue = this.searchFilterAmount;
        }
      } else if (limitToken.type === TokenTypeStr._721) {
        this.syncSearchFilterId();
        if (this.searchFilterIdStatus === 2) {
          let msg = marker(`Please input a valid token ID`);
          this.translate.get(msg).subscribe(res => msg = res);
          this.notification.sendError(msg);
          return;
        } else if (this.searchFilterIdStatus === 1) {
          limitValue = this.searchFilterId;
        }
      } else {
        console.error(`search(): unexpected filter token type: ${limitToken.type}`);
        return;
      }

      if (limitValue) {
        this.token.searchOrderByPair(fromTokenKey, toTokenKey, undefined, limitBy, limitValue);
        this.searchingLimitBy = limitBy;
        this.searchingLimitValue = limitValue;
      } else {
        this.token.searchOrderByPair(fromTokenKey, toTokenKey);
        this.searchingLimitBy = undefined;
        this.searchingLimitValue = undefined;
      }
      this.searchingFromToken = fromTokenKey;
      this.searchingToToken = toTokenKey;
      this.searchingBy = this.selectedSearchBy;
      this.searchingMore = false;
      this.searchingExpectedResults = 10;
    }

    this.searchStatus = SearchStatus.SEARCHING;
    this.unsubscribeSearchedOrders();
    this.searchResults = [];
  }

  searchMore(since?: OrderInfo) {
    if (this.searchResults.length >= this.searchingExpectedResults) return;
    if (this.selectedSearchBy !== SearchByOption.PAIR) return;
    if (!this.searchingFromToken || !this.searchingToToken || !this.searchingMore) {
      return;
    }

    if (!since && this.searchResults.length > 0) {
      since = this.searchResults[this.searchResults.length - 1];
    }

    let order;
    if (since) {
      order = {maker: since.maker.account, orderHeight: since.orderHeight.toDec()}
    }
    this.token.searchOrderByPair(this.searchingFromToken, this.searchingToToken,
      order, this.searchingLimitBy, this.searchingLimitValue);
      this.searchStatus = SearchStatus.SEARCHING;
  }

  loadMoreSearchResults() {
    this.searchingExpectedResults += 10;
    this.searchMore();
  }

  changePriceBase() {
    this.priceBaseToggle = !this.priceBaseToggle;
    this.syncPrice();
  }

  syncPrice(): number {
    if (!this.placeFungiblePair()) {
      this.priceStatus = 0;
      return 0;
    }

    this.placeAssetWidget!.syncAmount();
    if (this.placeAssetWidget!.amountStatus !== 1) {
      this.priceStatus = 0;
      return 0;
    }
    const offer = this.placeAssetWidget!.amount;

    if (this.priceInputText === '') {
      this.priceStatus = 0;
      return 0;
    }

    try {
      let decimalsBase = 0;
      let decimalsQuote = 0;
      if (this.priceBaseToggle) {
        decimalsBase = this.placeAssetWidget.selectedAsset!.decimals.toNumber();
        decimalsQuote = this.placeToTokenWidget!.selectedToken!.decimals;
      } else {
        decimalsBase = this.placeToTokenWidget!.selectedToken!.decimals;
        decimalsQuote = this.placeAssetWidget.selectedAsset!.decimals.toNumber();
      }
      this.priceBaseAmount = new U256(new BigNumber(10).pow(decimalsBase));
      const decimalsValue = new BigNumber(10).pow(decimalsQuote);
      this.priceQuoteAmount =
        new U256(new BigNumber(this.priceInputText).mul(decimalsValue));
      if (this.priceQuoteAmount.eq(0)) {
        this.priceStatus = 2;
        return 2;
      }
    } catch (err) {
      this.priceStatus = 2;
      return 2;
    }

    let lhs : U512;
    let rhs : U512;
    let targetSecure : U512;
    if (this.priceBaseToggle) {
      this.placeActualAmount = this.calcActualAmount(offer, this.priceBaseAmount,
                                                    this.priceQuoteAmount);
      lhs = new U512(this.placeActualAmount).mul(this.priceQuoteAmount);
      targetSecure = new U512(this.placeActualAmount);
      targetSecure = targetSecure.mul(this.priceQuoteAmount).idiv(this.priceBaseAmount);
      rhs = new U512(targetSecure).mul(this.priceBaseAmount);
    } else {
      this.placeActualAmount = this.calcActualAmount(offer, this.priceQuoteAmount,
                                                    this.priceBaseAmount);
      lhs = new U512(this.placeActualAmount).mul(this.priceBaseAmount);
      targetSecure = new U512(this.placeActualAmount);
      targetSecure = targetSecure.mul(this.priceBaseAmount).idiv(this.priceQuoteAmount);
      rhs = new U512(targetSecure).mul(this.priceQuoteAmount);
    }

    if (this.placeActualAmount.eq(0) || targetSecure.gt(U256.max()) || !lhs.eq(rhs)) {
      this.priceStatus = 2;
      return 2;
    }

    this.placeActualTargetAmount = new U256(targetSecure.toBigNumber())

    this.priceStatus = 1;
    return 1;
  }

  syncTargetTokenAmount(): number {
    if (this.targetTokenAmountInputText === '') {
      this.targetTokenAmountSatus = 0;
      return 0;
    }

    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken
       || this.placeToTokenWidget.selectedToken.type !== TokenTypeStr._20) {
        this.targetTokenAmountSatus = 0;
        return 0;
    }

    try {
      const decimals = this.placeToTokenWidget.selectedToken.decimals;
      const decimalsValue = new BigNumber(10).pow(decimals);
      this.targetTokenAmount =
        new U256(new BigNumber(this.targetTokenAmountInputText).mul(decimalsValue));
      if (this.targetTokenAmount.eq(0)) {
        this.targetTokenAmountSatus = 2;
        return 2;
      }
    } catch (err) {
      this.targetTokenAmountSatus = 2;
      return 2;
    }

      this.targetTokenAmountSatus = 1;
      return 1;
  }


  syncTargetTokenId(): number {
    if (this.targetTokenIdInputText === '') {
      this.targetTokenIdStatus = 0;
      return 0;
    }

    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken
      || this.placeToTokenWidget.selectedToken.type !== TokenTypeStr._721) {
      this.targetTokenIdStatus = 0;
      return 0;
    }

    try {
      this.targetTokenId =
        new U256(new BigNumber(this.targetTokenIdInputText));
    } catch (err) {
      this.targetTokenIdStatus = 2;
      return 2;
    }

    this.targetTokenIdStatus = 1;
    return 1;
  }

  showPriceBase(): string {
    return this.showPriceSymbol(this.priceBaseToggle);
  }

  showPriceQuote(): string {
    return this.showPriceSymbol(!this.priceBaseToggle);
  }

  shouldShowPrice(): boolean {
    return this.placeFungiblePair();
  }

  shoulShowMainAccountTips(): boolean {
    return this.activePanel === Panel.PLACE_ORDER && this.wallets.mainAccountSelected();
  }

  shouldShowTargetTokenAmount(): boolean {
    if (this.placeFungiblePair()) return false;
    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken
      || this.placeToTokenWidget.selectedToken.type !== TokenTypeStr._20) {
      return false;
    }
    return true;
  }

  shouldShowTargetTokenId(): boolean {
    if (this.placeFungiblePair()) return false;
    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken
      || this.placeToTokenWidget.selectedToken.type !== TokenTypeStr._721) {
      return false;
    }
    return true;
  }

  targetTokenSymbol(): string {
    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken) {
      return '';
    }
    return this.placeToTokenWidget.selectedToken.shortTextFormat();
  }

  showExpire(option: number): string {
    const expire = new U64(option);
    const days = expire.idiv(24);
    const hours = expire.mod(24);

    if (expire.eq(0)) {
      let msg = marker(`Never`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    let dayStr = '';
    if (days.eq(1)) {
      let msg = marker(`Day`);
      this.translate.get(msg).subscribe(res => msg = res);
      dayStr = msg;
    } else if (days.gt(1)) {
      let msg = marker(`Days`);
      this.translate.get(msg).subscribe(res => msg = res);
      dayStr = msg;
    }

    let hourStr = '';
    if (hours.eq(1)) {
      let msg = marker(`Hour`);
      this.translate.get(msg).subscribe(res => msg = res);
      hourStr = msg;
    } else if (hours.gt(1)) {
      let msg = marker(`Hours`);
      this.translate.get(msg).subscribe(res => msg = res);
      hourStr = msg;
    }

    let result = '';
    if (!days.eq(0)) {
      result = `${days.toDec()} ${dayStr}`;
    }

    if (!hours.eq(0)) {
      if (result === '') {
        result = `${hours.toDec()} ${hourStr}`;
      } else {
        result = `${result} ${hours.toDec()} ${hourStr}`;
      }
    }

    return result;
  }


  confirmPlaceOrderFromToken(): string {
    if (!this.placeAssetWidget || !this.placeAssetWidget.selectedAsset) {
      return "";
    }
    return this.placeAssetWidget.selectedAsset.textFormat();
  }

  confirmPlaceOrderToToken(): string {
    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken) {
      return "";
    }
    return this.placeToTokenWidget.selectedToken.textFormat();
  }

  confirmPlaceOrderFromAmount(): string {
    if (!this.placeAssetWidget || !this.placeToTokenWidget) {
      return '';
    }
    const fromToken = this.placeAssetWidget.selectedAsset;
    const toToken = this.placeToTokenWidget.selectedToken;
    if (!fromToken || !toToken) {
      return '';
    }
    if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._20) {
      if (this.priceStatus !== 1) {
        return "";
      }
      return this.placeActualAmount.toBalanceStr(fromToken.decimals, true) + ' ' + fromToken.symbol;
    } else {
      return this.placeAssetWidget.showAmount();
    }
  }

  confirmPlaceOrderToAmount(): string {
    if (!this.placeAssetWidget || !this.placeToTokenWidget) {
      return '';
    }
    const fromToken = this.placeAssetWidget.selectedAsset;
    const toToken = this.placeToTokenWidget.selectedToken;
    if (!fromToken || !toToken) {
      return '';
    }
    if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._20) {
      if (this.priceStatus !== 1) {
        return "";
      }
      return this.placeActualTargetAmount.toBalanceStr(new U8(toToken.decimals), true) + ' ' + toToken.symbol;
    } else if (toToken.type === TokenTypeStr._20) {
      return this.targetTokenAmount.toBalanceStr(new U8(toToken.decimals), true) + ' ' + toToken.symbol;
    } else if (toToken.type === TokenTypeStr._721) {
      return `1 ${toToken.symbol} (${this.targetTokenId.toDec()})`;
    } else {
      return '';
    }
  }

  address(): string {
    return this.wallets.selectedAccountAddress();
  }

  placeCheck(): boolean {
    if (this.wallets.mainAccountSelected()) return true;
    if (!this.placeAssetWidget) return true;
    if (this.placeAssetWidget.check()) return true;
    if (!this.placeToTokenWidget) return true;
    if (this.placeToTokenWidget.check()) return true;

    const fromToken = this.placeAssetWidget.selectedAsset!;
    const toToken = this.placeToTokenWidget.selectedToken!;

    if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._20) {
      if (this.syncPrice() != 1) return true;
    } else if (toToken.type === TokenTypeStr._20) {
      if (this.syncTargetTokenAmount() != 1) return true;
    } else if (toToken.type === TokenTypeStr._721) {
      if (this.syncTargetTokenId() != 1) return true;
    } else {
      console.log("Unknown target token type: ", toToken.type);
      return true;
    }
    return false;
  }

  place() {
    if (this.placeCheck()) return;

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => { this.activePanel = Panel.CONFIRM_PLACE_ORDER; });
        return;
      }
    }

    this.activePanel = Panel.CONFIRM_PLACE_ORDER;
  }

  placeClear() {
    this.placeToTokenWidget.clear();
    this.placeAssetWidget.clear();
    this. priceInputText = '';
    this.targetTokenAmountInputText = '';
    this.targetTokenIdInputText = '';
    this.selectedMinTrade = '10';
    this.selectedExpire = '24';
    this.priceBaseToggle = true;
    this.priceBaseAmount = new U256(0);
    this.priceQuoteAmount = new U256(0);
    this.placeActualAmount = new U256(0);
    this.placeActualTargetAmount = new U256(0);
    this.targetTokenAmount = new U256(0);
    this.targetTokenId = new U256(0);
  }

  confirmPlaceOrder() {
    if (this.placeCheck()) {
      this.activePanel = Panel.PLACE_ORDER;
      return;
    }

    if (!this.token.ready())
    {
      let msg = marker(`The account is synchronizing, please try later`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (!this.token.mainAccountSet()) {
      const result = this.token.setMainAccount(this.address(), this.wallets.mainAccountAddress());
      if (result.errorCode !== WalletErrorCode.SUCCESS) {
        let msg = result.errorCode;
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        this.activePanel = Panel.PLACE_ORDER;
        return;
      }
    }

    const fromToken = this.placeAssetWidget.selectedAsset!;
    const toToken = this.placeToTokenWidget.selectedToken!;
    let timeout = new U64(this.selectedExpire);
    if (timeout.eq(0)) {
      timeout = U64.max();
    } else {
      timeout = timeout.mul(3600).plus(this.server.getTimestamp());
    }
    
    const value: any = {
      token_offer: {
        chain: fromToken.chain,
        type: fromToken.type,
        address_raw: fromToken.addressRaw.toHex()
      },
      token_want: {
        chain: toToken.chain,
        type: toToken.type,
        address_raw: toToken.addressRaw.toHex()
      },
      timeout: timeout.toDec()
    };
    if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._20) {
      const minOffer = new U256(new U512(this.placeActualAmount).mul(this.selectedMinTrade).idiv(100).toBigNumber());
      if (this.priceBaseToggle) {
        value.value_offer = this.priceBaseAmount.toDec();
        value.value_want = this.priceQuoteAmount.toDec();
        value.min_offer = this.calcActualAmount(minOffer, this.priceBaseAmount,
                                                this.priceQuoteAmount).toDec();

      } else {
        value.value_offer = this.priceQuoteAmount.toDec();
        value.value_want = this.priceBaseAmount.toDec();
        value.min_offer = this.calcActualAmount(minOffer, this.priceQuoteAmount,
                                                this.priceBaseAmount).toDec();
      }
      value.max_offer = this.placeActualAmount.toDec();
    } else if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._721) {
      value.value_offer = this.placeAssetWidget.amount.toDec();
      value.value_want = this.targetTokenId.toDec();
    } else if (fromToken.type === TokenTypeStr._721 && toToken.type === TokenTypeStr._20) {
      value.value_offer = this.placeAssetWidget.tokenId.toDec();
      value.value_want = this.targetTokenAmount.toDec();
    } else if (fromToken.type === TokenTypeStr._721 && toToken.type === TokenTypeStr._721) {
      value.value_offer = this.placeAssetWidget.tokenId.toDec();
      value.value_want = this.targetTokenId.toDec();
    } else {
      console.error(`confirmPlaceOrder: unexpected pair`);
      this.activePanel = Panel.PLACE_ORDER;
      return;
    }

    const result = this.token.makeOrder(this.address(), value);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent order placing block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.placeClear();
    this.activePanel = Panel.PLACE_ORDER;
  }

  ping(order: OrderInfo) {
    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => { this.doPing(order) });
        return;
      }
    }
    this.doPing(order);
  }

  pingSelectedOrder() {
    const order = this.selectedOrder;
    if (!order) return;
    this.ping(order);
  }

  doPing(order: OrderInfo) {
    if (!this.token.ready())
    {
      let msg = marker(`The account is synchronizing, please try later`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    
    const result = this.token.ping(order, this.address());
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent { ping } block!`);
    const param = { ping: 'Ping' };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);
  }

  orders(): OrderSwapInfo[] {
    return this.token.orders();
  }

  orderCreatedAt(order: OrderSwapInfo | OrderInfo) : number {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return order.createdAt.toNumber();
  }

  orderHash(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return order.hash.toHex();
  }

  orderFromTokenSymbol(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    const token = order.tokenOffer;
    return this.getTokenSymbol(token.chain, token.address, token.type);
  }

  orderToTokenSymbol(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    const token = order.tokenWant;
    return this.getTokenSymbol(token.chain, token.address, token.type);
  }

  orderFromTokenType(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    const token = order.tokenOffer;
    return this.getTokenTypeShown(token.chain, token.type);
  }

  orderToTokenType(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    const token = order.tokenWant;
    return this.getTokenTypeShown(token.chain, token.type);
  }

  orderFillRate(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return `${order.fillRate()}%`;
  }

  orderStatus(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }

    if (order.fulfilled()) {
      let msg = marker('Completed')
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    if (order.cancelled()) {
      let msg = marker('Cancelled')
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    if (order.timeout.lt(this.server.getTimestamp())) {
      let msg = marker('Expired')
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    let msg = marker('Active');
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

  orderMaker(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return order.maker.account;
  }

  orderPrice(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }

    const ret = this.pairWithSameSymbol(order);
    if (ret.error) return '';
    const showType = ret.same!;

    let token = order.tokenOffer;
    const offer = this.formatTokenValue(token.chain, token.address, token.type, order.valueOffer, showType);
    token = order.tokenWant;
    const want = this.formatTokenValue(token.chain, token.address, token.type, order.valueWant, showType);
    return `${offer} = ${want}`;
  }

  orderFromValue(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }

    let token = order.tokenOffer;
    return this.formatTokenValue(token.chain, token.address, token.type, order.valueOffer, false, true);
  }

  orderToValue(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }

    let token = order.tokenWant;
    return this.formatTokenValue(token.chain, token.address, token.type, order.valueWant, false, true);
  }

  orderAvailable(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }

    if (order.finished() || order.timeout.lt(this.server.getTimestamp())) {
      return '0';
    }

    const token = order.tokenOffer;
    if (order.fungiblePair()) {
      const minOffer = order.leftOffer.lt(order.minOffer) ? order.leftOffer: order.minOffer;
      const maxOffer = order.leftOffer;
      const metaInfo = this.getTokenMetaInfo(token.chain, token.address, token.type);
      if (!metaInfo) return '';
      const minFormat = minOffer.toBalanceStr(new U8(metaInfo.decimals));
      const maxFormat = this.formatTokenValue(token.chain, token.address, token.type, maxOffer, false);
      if (!maxFormat) return '';
      return `${minFormat} ~ ${maxFormat}`;
    } else {
      return this.formatTokenValue(token.chain, token.address, token.type, order.valueOffer, false, true);
    }
  }

  selectOrder(order: OrderSwapInfo | OrderInfo, self: boolean = true) {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    this.selectedOrder = order;
    if (self) {
      this.activePanel = Panel.MY_ORDER_DETAILS;
    } else {  
      this.activePanel = Panel.ORDER_DETAILS;
    }
  }

  selectedOrderCreatedAt(): number {
    return this.selectedOrder ? this.orderCreatedAt(this.selectedOrder) : 0;
  }

  selectedOrderExpiredDateValid(): boolean {
    return this.selectedOrder ? this.selectedOrder.timeout.lt(U64.max()) : false;
  }

  selectedOrderExpiredAt(): any {
    if (!this.selectedOrder) {
      return '';
    }
    const order = this.selectedOrder;
    if (order.timeout.eq(U64.max())) {
      let msg = marker(`Never`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }
    return order.timeout.toNumber();
  }

  selectedOrderHash(): string {
    return this.selectedOrder ? this.orderHash(this.selectedOrder) : '';
  }

  orderIdCopied() {
    let msg = marker(`Order ID copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedOrderMaker(): string {
    return this.selectedOrder ? this.orderMaker(this.selectedOrder) : '';
  }

  selectedOrderMakerCopied() {
    let msg = marker(`Maker's account copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedOrderFromTokenTrusted(): boolean {
    const order = this.selectedOrder;
    if (!order) return false;
    const token = order.tokenOffer;
    return this.tokenTrusted(token.chain, token.address, token.type);
  }

  selectedOrderToTokenTrusted(): boolean {
    const order = this.selectedOrder;
    if (!order) return false;
    const token = order.tokenWant;
    return this.tokenTrusted(token.chain, token.address, token.type);
  }

  selectedOrderFromTokenSymbol(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    return this.orderFromTokenSymbol(order);
  }

  selectedOrderToTokenSymbol(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    return this.orderToTokenSymbol(order);
  }

  selectedOrderFromTokenType(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    return this.orderFromTokenType(order);
  }

  selectedOrderFromTokenAddress(): string {
    if (!this.selectedOrder) return '';
    return this.selectedOrder.tokenOffer.address;
  }

  selectedOrderToTokenAddress(): string {
    if (!this.selectedOrder) return '';
    return this.selectedOrder.tokenWant.address;
  }

  selectedOrderToTokenType(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    return this.orderToTokenType(order);
  }

  selectedOrderFromTokenTypes(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    const token = order.tokenOffer;
    return this.getTokenTypeShown(token.chain, token.type);
  }

  selectedOrderFromTokenTypeAddress(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    const token = order.tokenOffer;
    return this.getTokenTypeAndAddress(token.chain, token.address, token.type);
  }

  selectedOrderToTokenTypeAddress(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    const token = order.tokenWant;
    return this.getTokenTypeAndAddress(token.chain, token.address, token.type);
  }

  tokenAddressCopied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  selectedOrderStatus(): string {
    return this.selectedOrder ? this.orderStatus(this.selectedOrder) : '';
  }

  selectedOrderFillRate(): string {
    return this.selectedOrder ? this.orderFillRate(this.selectedOrder) : '';
  }

  selectedOrderFromTokenAmount(): string {
    if (!this.selectedOrder) return '';
    const order = this.selectedOrder;
    if (order.fungiblePair()) {
      return this.formatTokenValue(order.tokenOffer.chain, order.tokenOffer.address,
        order.tokenOffer.type, order.maxOffer);
    } else {
      return this.formatTokenValue(order.tokenOffer.chain, order.tokenOffer.address,
        order.tokenOffer.type, order.valueOffer);
    }
  }

  selectedOrderToTokenAmount(): string {
    if (!this.selectedOrder) return '';
    const order = this.selectedOrder;
    if (order.fungiblePair()) {
      const amount = new U512(order.maxOffer).mul(order.valueWant).idiv(order.valueOffer);
      return this.formatTokenValue(order.tokenWant.chain, order.tokenWant.address,
        order.tokenWant.type, new U256(amount.toBigNumber()));
    } else {
      return this.formatTokenValue(order.tokenWant.chain, order.tokenWant.address,
        order.tokenWant.type, order.valueWant);
    }
  }

  selectedOrderPrice() {
    if (!this.selectedOrder) return '';
    return this.orderPrice(this.selectedOrder);
  }

  selectedOrderWithFungiblePair(): boolean {
    if (!this.selectedOrder) return false;
    return this.selectedOrder.fungiblePair();
  }

  selectedOrderMinTradeSize(): string {
    if (!this.selectedOrder) return '';
    const order = this.selectedOrder;
    if (order.fungiblePair()) {
      return this.formatTokenValue(order.tokenOffer.chain, order.tokenOffer.address,
        order.tokenOffer.type, order.minOffer);
    } else {
      return '';
    }
  }

  selectedOrderFilledAmount(): string {
    if (!this.selectedOrder) return '';
    const order = this.selectedOrder;
    if (order.fungiblePair()) {
      return this.formatTokenValue(order.tokenOffer.chain, order.tokenOffer.address,
        order.tokenOffer.type, order.maxOffer.minus(order.leftOffer));
    } else {
      return '';
    }
  }

  selectedOrderLeftAmount(): string {
    if (!this.selectedOrder) return '';
    const order = this.selectedOrder;
    if (order.fungiblePair()) {
      return this.formatTokenValue(order.tokenOffer.chain, order.tokenOffer.address,
        order.tokenOffer.type, order.leftOffer);
    } else {
      return '';
    }
  }

  selectedOrderCancelable(): boolean {
    const order = this.selectedOrder;
    if (!order) return false;
    if (order.maker.account !== this.address()) return false;
    if (order.finished()) return false;
    if (this.token.orderCancelling(order.maker.account, order.orderHeight)) return false;
    if (this.token.swappingAsMaker(order.maker.account)) return false;
    return true;
  }

  orderActionStatus(order: OrderInfo): OrderActionStatus {
    const info = this.token.makerInfo(order.maker.account);
    if (!info) return OrderActionStatus.DISABLE;
    const makerOrder = info.getOrder(order.orderHeight);
    if (!makerOrder) return OrderActionStatus.DISABLE;
    return makerOrder.status;
  }

  selectedOrderActionStatus(): OrderActionStatus {
    const order = this.selectedOrder;
    if (!order) return OrderActionStatus.DISABLE;
    return this.orderActionStatus(order);
  }

  cancelOrder() {
    if (!this.selectedOrderCancelable()) return;

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword(() => { this.activePanel = Panel.CONFIRM_CANCEL_ORDER; });
        return;
      }
    }

    this.activePanel = Panel.CONFIRM_CANCEL_ORDER;
  }

  confirmCancelOrder() {
    if (!this.selectedOrder) {
      this.activePanel = Panel.PLACE_ORDER;
      return;
    }

    if (!this.token.ready())
    {
      let msg = marker(`The account is synchronizing, please try later`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    const result = this.token.cancelOrder(this.address(), this.selectedOrder.orderHeight);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent order cancellation block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.activePanel = Panel.MY_ORDER_DETAILS;
  }

  selectedOrderIdShort(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    const hash = order.hash.toHex();
    return `${hash.substring(0, 4)}...${hash.substring(hash.length - 4)}`;
  }

  selectedOrderFromTokenTypeAndAddress(): string {
    const order = this.selectedOrder;
    if (!order) return '';
    const token = order.tokenOffer;
    return this.getTokenTypeAndAddress(token.chain, token.address, token.type);
  }

  pairWithSameSymbol(order: OrderInfo): {error: boolean, same?: boolean} {
    let token = order.tokenOffer;
    const metaOffer = this.getTokenMetaInfo(token.chain, token.address, token.type);
    if (!metaOffer) return {error: true};
    token = order.tokenWant;
    const metaWant = this.getTokenMetaInfo(token.chain, token.address, token.type);
    if (!metaWant) return {error: true};
    let same;
    if (!metaOffer.trusted || !metaWant.trusted) {
      same = false;
    } else {
     same = metaOffer.symbol === metaWant.symbol;
    }
    return {error: false, same};
  }

  private getTokenTypeAndAddress(chain: string, address: string, type: string): string {

    const metaInfo = this.getTokenMetaInfo(chain, address, type);
    if (!metaInfo) return '';

    let tokenType = ChainHelper.tokenTypeShown(chain, type as TokenTypeStr);
    tokenType = tokenType.replace('-', '');

    const shortAddress = ChainHelper.toShortAddress(chain, address);
    const native = ChainHelper.isNative(chain, address);
    if (native) {
      return `<${metaInfo.name}>`;
    } else {
      return `<${tokenType}: ${shortAddress}>`;
    }
  }

  private tokenTrusted(chain: string, address: string, type: string): boolean {
    const metaInfo = this.getTokenMetaInfo(chain, address, type);
    if (!metaInfo) return false;
    return metaInfo.trusted;
  }

  private getTokenSymbol(chain: string, address: string, type: string): string {
    const metaInfo = this.getTokenMetaInfo(chain, address, type);
    if (!metaInfo) return '';
    if (metaInfo.trusted) return metaInfo.symbol;
    return ChainHelper.toShortAddress(chain, address);
  }

  private getTokenTypeShown(chain: string, type: string): string {
    let tokenType = ChainHelper.tokenTypeShown(chain, type as TokenTypeStr);
    tokenType = tokenType.replace('-', '');
    return `<${tokenType}>`;
  }

  private formatTokenValue(chain: string, address: string, type: string, value: U256,
    showType: boolean = false, shortTokenId: boolean = false): string {
    if (type !== TokenTypeStr._20 && type !== TokenTypeStr._721) return '';

    const info = this.getTokenMetaInfo(chain, address, type);
    if (!info) {
      return '';
    }

    let shortAddress = '';
    if (!info.trusted) {
      shortAddress = ChainHelper.toShortAddress(chain, address);
    }

    if (!showType) {
      if (type === TokenTypeStr._20) {
        if (info.trusted) {
          return value.toBalanceStr(new U8(info.decimals), true) + ' ' + info.symbol;
        } else {
          return value.toBalanceStr(new U8(info.decimals), true) + ` <${shortAddress}>`;
        }
      } else if (type === TokenTypeStr._721) {
        let tokenId  = value.toDec();
        if (shortTokenId && tokenId.length >= 12) {
          tokenId = `${tokenId.substring(0, 4)}...${tokenId.substring(tokenId.length - 4)}`;
        }
        if (info.trusted) {
          return `1 ${info.symbol} (${tokenId})`;
        } else {
          return `1 <${shortAddress}> (${tokenId})`;
        }
      } 
    } else {
      let typeShown = ChainHelper.tokenTypeShown(chain, type);
      typeShown = typeShown.replace('-', '');
      if (type === TokenTypeStr._20) {
        if (info.trusted) {
          return value.toBalanceStr(new U8(info.decimals), true) + ` ${info.symbol} <${typeShown}>`;
        } else {
          return value.toBalanceStr(new U8(info.decimals), true) + ` <${typeShown}: ${shortAddress}>`;
        }
      } else if (type === TokenTypeStr._721) {
        let tokenId  = value.toDec();
        if (shortTokenId && tokenId.length >= 12) {
          tokenId = `${tokenId.substring(0, 4)}...${tokenId.substring(tokenId.length - 4)}`;
        }
        if (info.trusted) {
          return `1 ${info.symbol} (${tokenId}) <${typeShown}>`;
        } else {
          return `1 <${typeShown}: ${shortAddress}> (${tokenId})`;
        }
      }
    }

    return '';
  }

  private getTokenMetaInfo(chain: string, address: string, type: string): TokenMetaInfo | undefined {
    // todo: add custom tokens
    const native = ChainHelper.isNative(chain, address);
    const verified = this.verified.token(chain, native ? '' : address);
    if (verified) {
      const verifiedType = TokenHelper.toTypeStr(verified.type);
      if (type === verifiedType) {
        return new TokenMetaInfo(verified.name, verified.symbol, verifiedType, verified.decimals, true);
      }
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo) {
      const queriedType = TokenHelper.toTypeStr(tokenInfo.type);
      if (type === queriedType) {
        return new TokenMetaInfo(tokenInfo.name, tokenInfo.symbol, type, tokenInfo.decimals.toNumber(), false);
      }
    } else {
      this.token.queryTokenInfo(chain, address, false);
    }

    return undefined;
  }

  private showPriceSymbol(toggle: boolean): string {
    if (toggle) {
      if (!this.placeAssetWidget || !this.placeAssetWidget.selectedAsset) {
        return '';
      }
      return this.placeAssetWidget.selectedAsset.shortTextFormat();
    } else {
      if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken) {
        return '';
      }
      return this.placeToTokenWidget.selectedToken.shortTextFormat();
    }
  }

  private placeFungiblePair(): boolean {
    if (!this.placeAssetWidget || !this.placeAssetWidget.selectedAsset
      || this.placeAssetWidget.selectedAsset.type !== TokenTypeStr._20) {
      return false;
    }

    if (!this.placeToTokenWidget || !this.placeToTokenWidget.selectedToken
      || this.placeToTokenWidget.selectedToken.type !== TokenTypeStr._20) {
      return false;
    }

    return true;
  }

  private calcActualAmount(amount: U256, base: U256, quote: U256) {
    const gcd = U256.gcd(base, quote);
    if (gcd.eq(0)) return new U256(0);
    const unit = base.idiv(gcd);
    return amount.idiv(unit).mul(unit);
  }

  private sortSearchResults() {
    this.searchResults.sort((lhs, rhs) => {
      if (lhs.normalizedPrice().lt(rhs.normalizedPrice())) {
        return -1;
      }
      if (lhs.normalizedPrice().gt(rhs.normalizedPrice())) {
        return 1;
      }
      const lhsMaker = new U256();
      lhsMaker.fromAccountAddress(lhs.maker.account);
      const rhsMaker = new U256();
      rhsMaker.fromAccountAddress(rhs.maker.account);
      if (lhsMaker.lt(rhsMaker)) {
        return -1;
      }
      if (lhsMaker.gt(rhsMaker)) {
        return 1;
      }
      if (lhs.orderHeight.lt(rhs.orderHeight)) {
        return -1;
      }
      if (lhs.orderHeight.gt(rhs.orderHeight)) {
        return 1;
      }
      return 0;
    });
  }

  private updateSearchResults(order: OrderInfo, sort: boolean = true) {
    if (this.address() === order.maker.account || this.address() === order.mainAccount) {
      return;
    }
    const remove = order.expired(this.server.getTimestamp()) || order.finished();
    const index = this.searchResults.findIndex(x => x.eq(order));
    if (index === -1) {
      if (remove) return;
      this.searchResults.push(order);
      this.token.subscribeOrder(order)  
      if (sort) {
        this.sortSearchResults();
      }
    } else {
      if (remove) {
        this.token.unsubscribeOrder(order);
        this.searchResults.splice(index, 1);
      } else {
        this.searchResults[index] = order;
      }
    }
  }

}

enum SearchByOption {
  ID = 'id',
  PAIR = 'pair',
}

enum FilterByOption {
  FROM_TOKEN = 'from_token',
  TO_TOKEN = 'to_token',
}

enum Panel {
  DEFAULT = '',
  PLACE_ORDER = 'place_order',
  CONFIRM_PLACE_ORDER = 'confirm_place_order',
  MY_ORDER_DETAILS = 'my_order_details',
  CONFIRM_CANCEL_ORDER = 'confirm_cancel_order',
  ORDER_DETAILS = 'order_details',
}

class TokenMetaInfo {
  name: string = '';
  symbol: string = '';
  type: string = '';
  decimals: number = 0;
  trusted: boolean = false;

  constructor(name: string, symbol: string, type: string, decimals: number, trusted: boolean) {
    this.name = name;
    this.symbol = symbol;
    this.type = type;
    this.decimals = decimals;
    this.trusted = trusted;
  }
}

enum SearchStatus {
  INIT = 'init',
  SEARCHING = 'searching',
  SEARCHED = 'searched',
}
