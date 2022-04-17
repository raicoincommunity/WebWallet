import { Component, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { U256, TokenTypeStr, U512, U8, U64, ChainHelper } from '../../services/util.service';
import { TokenWidgetComponent } from '../token-widget/token-widget.component';
import { NotificationService } from '../../services/notification.service';
import { AssetWidgetComponent } from '../asset-widget/asset-widget.component';
import { BigNumber } from 'bignumber.js';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { OrderSwapInfo, TokenService, OrderInfo } from '../../services/token.service';
import { ServerService } from '../../services/server.service'
import { VerifiedTokensService } from '../../services/verified-tokens.service';

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.css']
})
export class P2pComponent implements OnInit {
  @ViewChild('searchFromTokenWidget') searchFromTokenWidget! : TokenWidgetComponent;
  @ViewChild('searchToTokenWidget') searchToTokenWidget! : TokenWidgetComponent;
  @ViewChild('placeToTokenWidget') placeToTokenWidget! : TokenWidgetComponent;
  @ViewChild('placeAssetWidget') placeAssetWidget! : AssetWidgetComponent;

  // search orders
  activePanel = '';
  selectedSearchBy = SearchByOption.PAIR;
  inputSearchOrderId = '';
  searchOrderCollapsed = false;

  // todo:
  searchResults: OrderSwapInfo[] = [];
  

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

  constructor(
    private notification: NotificationService,
    private wallets: WalletsService,
    private token: TokenService,
    private server: ServerService,
    private verified: VerifiedTokensService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.token.orderInfo$.subscribe(order => {
      if (!this.selectedOrder) return;
      if (!this.selectedOrder.eq(order)) return;
      this.selectedOrder = order;
    });
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
    if (!this.searchFromTokenWidget || !this.searchFromTokenWidget.selectedToken
        || !this.searchToTokenWidget || !this.searchToTokenWidget.selectedToken) {
      let msg = marker(`Please input the token pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    const fromToken = this.searchFromTokenWidget.selectedToken;
    const toToken = this.searchToTokenWidget.selectedToken;
    if (fromToken.chain === toToken.chain && fromToken.address === toToken.address)
    {
      let msg = marker(`Invalid token pair`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    
    // todo:
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

  orderFromTokenShort(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return this.getShortToken(order.tokenOffer.chain, order.tokenOffer.address,
                              order.tokenOffer.type);
  }

  orderFromTokenLong(order: OrderSwapInfo | OrderInfo) : string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return this.getLongToken(order.tokenOffer.chain, order.tokenOffer.address,
                              order.tokenOffer.type);
  }

  orderToTokenShort(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return this.getShortToken(order.tokenWant.chain, order.tokenWant.address,
                              order.tokenWant.type);
  }

  orderToTokenLong(order: OrderSwapInfo | OrderInfo): string {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    return this.getLongToken(order.tokenWant.chain, order.tokenWant.address,
      order.tokenWant.type);
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
    let token = order.tokenOffer;
    const offer = this.formatTokenValue(token.chain, token.address, token.type, order.valueOffer);
    token = order.tokenWant;
    const want = this.formatTokenValue(token.chain, token.address, token.type, order.valueWant);
    return `${offer} = ${want}`;
  }

  selectOrder(order: OrderSwapInfo | OrderInfo, self: boolean = true) {
    if (order instanceof OrderSwapInfo) {
      order = order.order;
    }
    this.selectedOrder = order;
    if (self) {
      this.activePanel = Panel.MY_ORDER_DETAILS;
    } else {  
      //this.activePanel = Panel.ORDER_DETAILS;
      // todo:
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

  selectedOrderHashCopied() {
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

  selectedOrderFromToken(): string {
    return this.selectedOrder ? this.orderFromTokenLong(this.selectedOrder) : '';
  }

  selectedOrderFromTokenAddress(): string {
    if (!this.selectedOrder) return '';
    return this.selectedOrder.tokenOffer.address;
  }

  selectedOrderToTokenAddress(): string {
    if (!this.selectedOrder) return '';
    return this.selectedOrder.tokenWant.address;
  }

  selectedOrderToToken(): string {
    return this.selectedOrder ? this.orderToTokenLong(this.selectedOrder) : '';
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
    if (this.token.swapping(order.maker.account)) return false;
    return true;
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

  private getShortToken(chain: string, address: string, type: string): string {

    // todo: add custom tokens
    let tokenType = ChainHelper.tokenTypeShown(chain, type as TokenTypeStr);
    tokenType = tokenType.replace('-', '');

    const native = ChainHelper.isNative(chain, address);
    const verified = this.verified.token(chain, native ? '' : address);
    if (verified) {
      if (native) {
        return `${verified.symbol} <${verified.name}>`;
      } else {
        return `${verified.symbol} <${tokenType}>`;
      }
    }

    const shortAddress = ChainHelper.toShortAddress(chain, address);
    return `${shortAddress} <${tokenType}>`;
  }

  private getLongToken(chain: string, address: string, type: string): string {

    // todo: add custom tokens
    let tokenType = ChainHelper.tokenTypeShown(chain, type as TokenTypeStr);
    tokenType = tokenType.replace('-', '');

    const shortAddress = ChainHelper.toShortAddress(chain, address);
    const native = ChainHelper.isNative(chain, address);
    const verified = this.verified.token(chain, native ? '' : address);
    if (verified) {
      if (native) {
        return `${verified.symbol} <${verified.name}>`;
      } else {
        return `${verified.symbol} <${tokenType}: ${shortAddress}>`;
      }
    }

    return `${shortAddress} <${tokenType}>`;
  }

  private formatTokenValue(chain: string, address: string, type: string, value: U256): string {
    // todo: add custom tokens

    let symbol = '';
    let decimals = new U8(0);

    const native = ChainHelper.isNative(chain, address);
    const verified = this.verified.token(chain, native ? '' : address);
    if (verified) {
      symbol = verified.symbol;
      decimals = new U8(verified.decimals);
    }

    if (type === TokenTypeStr._20) {
      return value.toBalanceStr(decimals, true) + ' ' + symbol;
    } else if (type === TokenTypeStr._721) {
      return `1 ${symbol} (${value.toDec()})`;
    } else {
      return '';
    }
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

}

enum SearchByOption {
  ID = 'id',
  PAIR = 'pair',
}

enum Panel {
  DEFAULT = '',
  PLACE_ORDER = 'place_order',
  CONFIRM_PLACE_ORDER = 'confirm_place_order',
  MY_ORDER_DETAILS = 'my_order_details',
  CONFIRM_CANCEL_ORDER = 'confirm_cancel_order',
}