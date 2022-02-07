import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { ChainHelper, U256, U8 } from '../../services/util.service';
import { TokenService, AccountTokenInfo } from '../../services/token.service';
import { environment } from '../../../environments/environment';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-asset-widget',
  templateUrl: './asset-widget.component.html',
  styleUrls: ['./asset-widget.component.css']
})
export class AssetWidgetComponent implements OnInit {

  @ViewChild('assetDropdown') assetDropdown! : ElementRef;
  @ViewChild('assetInput') assetInput! : ElementRef;
  @ViewChild('assetSelect') assetSelect! : ElementRef;

  debugCount2: number = 0;
  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.assetInput
       && !this.assetInput.nativeElement.contains(event.target)
       && !this.assetSelect.nativeElement.contains(event.target)) {
      this.hideSearchResult();
    }
  }

  assetInputText: string = '';
  selectedAsset: AssetItem | undefined;
  assetFocused: boolean = false;
  searchResultShown: boolean = false;
  amountInputText: string = '';
  amountStatus: number = 0;

  amount: U256 = new U256();

  constructor(
    private wallets: WalletsService,
    private logo: LogoService,
    private token: TokenService,
    private translate: TranslateService
  ) { 
  }

  ngOnInit(): void {
  }

  selectedAccount(): string {
    return this.wallets.selectedAccountAddress();
  }

  onFocus() {
    this.assetFocused = true;
    this.showSearchResult();
  }

  onBlur() {
    this.assetFocused = false;
  }

  onChange() {
    if (this.selectedAsset && this.selectedAsset.textFormat() !== this.assetInputText) {
      this.selectedAsset = undefined;
    }
  }

  showSearchResult() {
    this.searchResultShown = true;
    this.assetDropdown.nativeElement.classList.add('uk-open');
  }

  hideSearchResult() {
    this.searchResultShown = false;
    this.assetDropdown.nativeElement.classList.remove('uk-open');
  }

  assets(): AssetItem[] {
    const items: AssetItem[] = [];
    items.push(this.defautlAssetItem());
    const tokens = this.token.tokens(this.selectedAccount());
    for (let token of tokens) {
      if (token.balance.eq(0)) continue;
      items.push(this.makeAssetItem(token));
    }
    return items.filter(item => {
      if (this.assetInputText.includes('<')) return true;
       return item.symbol.toUpperCase().includes(this.assetInputText.toUpperCase());
      });
  }

  style(): string {
    if (this.selectedAsset) {
      return "padding-left: 50px; font-weight: bold;"
    } else {
      return this.assetInputText ? "font-weight: bold;" : "";
    }
  }

  onSelect() {
    this.showSearchResult();
  }

  selectAsset(asset: AssetItem) {
    this.selectedAsset = asset;
    this.assetInputText = asset.textFormat();
    this.hideSearchResult();
    this.syncAmount();
  }

  assetStatus(): number {
    if (!this.assetInputText) return 0;
    for (let asset of this.assets()) {
      if (this.assetInputText === asset.textFormat()) {
        return 1;
      }
    }
    return 2;
  }

  syncAmount() {
    try {
      if (!this.amountInputText || !this.selectedAsset) {
        this.amountStatus = 0;
        return;
      }
      const decimalsValue = new BigNumber(10).pow(this.selectedAsset.decimals.toNumber());
      this.amount =
        new U256(new BigNumber(this.amountInputText).mul(decimalsValue));
      if (this.amount.eq(0) || this.amount.gt(this.selectedAsset.balance)) {
        this.amountStatus = 2;
        return;
      }
      this.amountStatus = 1;
    }
    catch (err) {
      this.amountStatus = 2;
    }
  }

  setMaxAmount() {
    if (!this.selectedAsset) return;
    this.amount = this.selectedAsset.balance;
    this.amountInputText = this.amount.toBalanceStr(this.selectedAsset.decimals, false);
    this.syncAmount();
  }

  amountHint(): string {
    if (!this.selectedAsset) {
      let msg = marker(`The amount to send`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      let max = marker(`Max`);
      this.translate.get(max).subscribe(res => max = res);
      const asset = this.selectedAsset;
      const balance = asset.balance.toBalanceStr(asset.decimals, false);
      return `${max}: ${balance} ${asset.symbol}`;
    }
  }

  check(): boolean {
    if (this.assetStatus() !== 1 || !this.selectedAsset) {
      if (!this.assetInputText) {
        this.assetInput.nativeElement.focus();
      }
      return true;
    }

    this.syncAmount();
    if (this.amountStatus !== 1) {
      return true;
    }

    return false;
  }

  clear() {
    this.assetInputText = '';
    this.selectedAsset = undefined;
    this.amountInputText = '';
    this.amountStatus = 0;
    this.amount = new U256();
  }

  private makeAssetItem(token: AccountTokenInfo): AssetItem {
    const item = new AssetItem();
    item.chain = token.chain;
    item.address = token.address;
    if (token.addressRaw.isNativeTokenAddress()) {
      item.shortAddress = ChainHelper.toChainShown(item.chain);
      item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
    } else {
      item.shortAddress = ChainHelper.toShortAddress(item.chain, item.address);
      item.tokenLogo = this.logo.getTokenLogo(item.chain, item.address);
    }
    item.chainLogo = this.logo.getChainLogo(item.chain);
    item.symbol = token.symbol;
    item.decimals = token.decimals;
    item.balance = token.balance;
    return item;
  }

  private defautlAssetItem(): AssetItem {
    const item = new AssetItem();
    item.chain = environment.current_chain;
    item.shortAddress = ChainHelper.toChainShown(item.chain);
    item.chainLogo = this.logo.getChainLogo(item.chain);
    item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
    item.symbol = 'RAI';
    item.decimals = new U8(9);
    item.balance = new U256(this.wallets.balance().value);
    return item;
  }

}

class AssetItem {
  chain: string = '';
  address: string = '';
  shortAddress: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
  symbol: string = '';
  decimals: U8 = new U8();
  balance: U256 = new U256();

  textFormat(): string {
    return `${this.symbol} <${this.shortAddress}>`;
  }
}
