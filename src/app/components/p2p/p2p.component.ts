import { Component, OnInit, ViewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { U256, TokenTypeStr, U512, U8, U64 } from '../../services/util.service';
import { TokenWidgetComponent } from '../token-widget/token-widget.component';
import { NotificationService } from '../../services/notification.service';
import { AssetWidgetComponent } from '../asset-widget/asset-widget.component';
import { BigNumber } from 'bignumber.js';
import { WalletsService } from '../../services/wallets.service';

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


  activePanel = '';
  selectedSearchBy = SearchByOption.PAIR;
  inputSearchOrderId = '';
  priceInputText = '';
  priceStatus = 0;
  targetTokenAmountInputText = '';
  targetTokenAmountSatus = 0;
  targetTokenIdInputText = '';
  targetTokenIdStatus = 0;
  placeOrderCollapsed = false;
  searchOrderCollapsed = false;

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

  constructor(
    private notification: NotificationService,
    private wallets: WalletsService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  mainAccountSelected(): boolean {
    return this.wallets.mainAccountSelected();
  }

  shouldShowBackButton(): boolean {
    if (this.activePanel === '') return false;

    return true;
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

  check(): boolean {
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
    if (this.check()) return;

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

  confirmPlaceOrder() {
    if (this.check()) {
      this.activePanel = Panel.PLACE_ORDER;
      return;
    }

    const fromToken = this.placeAssetWidget.selectedAsset!;
    const toToken = this.placeToTokenWidget.selectedToken!;
    if (fromToken.type === TokenTypeStr._20 && toToken.type === TokenTypeStr._20) {
      // todo:
    } else if (toToken.type === TokenTypeStr._20) {
      // todo:
    } else {
      // todo:
    }
    // todo:
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
}