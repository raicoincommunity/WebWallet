import { Component, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { ChainHelper, U256, U8, TokenTypeStr, TokenHelper } from '../../services/util.service';
import { TokenService, AccountTokenInfo } from '../../services/token.service';
import { environment } from '../../../environments/environment';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenType } from '../../services/util.service';

@Component({
  selector: 'app-asset-widget',
  templateUrl: './asset-widget.component.html',
  styleUrls: ['./asset-widget.component.css']
})
export class AssetWidgetComponent implements OnInit {

  @ViewChild('assetDropdown') assetDropdown! : ElementRef;
  @ViewChild('assetInput') assetInput! : ElementRef;
  @ViewChild('assetSelect') assetSelect! : ElementRef;

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
  selectedTokenId: string = '';

  amount: U256 = new U256();
  tokenId: U256 = new U256();

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
    if (this.wallets.selectedAccount()?.synced) {
      items.push(this.defautlAssetItem());
    }
    if (this.token.synced(this.selectedAccount())) {
      const tokens = this.token.tokens(this.selectedAccount());
      for (let token of tokens) {
        if (token.balance.eq(0)) continue;
        items.push(this.makeAssetItem(token));
      }  
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
    this.selectedTokenId = '';
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

  syncTokenId(): boolean {
    const asset = this.selectedAsset;
    if (!asset || asset.type !== TokenTypeStr._721) return true;
    if (!this.selectedTokenId) return true;

    const info = this.token.accountTokenInfo(asset.chain, asset.address);
    if (!info) return true;
    try {
      this.tokenId = new U256(this.selectedTokenId);
      if (!info.ownTokenId(this.tokenId)) {
        return true;
      }
    } catch (err) {
      return true;
    }

    return false;
  }

  hasMoreTokenIds(): boolean {
    const asset = this.selectedAsset;
    if (!asset) return false;
    const info = this.token.accountTokenInfo(asset.chain, asset.address);
    if (!info) return false;
    return info.hasMoreTokenIds();
  }

  loadMoreBurnTokenIds() {
    const asset = this.selectedAsset;
    if (!asset) return;
    const size = this.token.getTokenIdsSize(asset.chain,  asset.address);
    this.token.setTokenIdsSize(asset.chain, asset.address, size + 100);
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

  checkAsset(): boolean {
    if (this.assetStatus() !== 1 || !this.selectedAsset
      || this.selectedAsset.textFormat() !== this.assetInputText) {
      return true;
    }
    return false;
  }

  check(): boolean {
    if (this.checkAsset()) {
      if (!this.assetInputText) {
        this.assetInput.nativeElement.focus();
      }
      return true;
    }

    if (this.selectedAsset!.type === TokenTypeStr._20) {
      this.syncAmount();
      if (this.amountStatus !== 1) return true;
    }
    else if (this.selectedAsset!.type === TokenTypeStr._721) {
      if (this.syncTokenId()) return true;
    } else {
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

  tokenIds(): string[] {
    if (!this.selectedAsset || this.selectedAsset.type !== TokenTypeStr._721) {
      return [];
    }
    if (!this.token.synced()) return [];
    const asset = this.selectedAsset;
    const ids = this.token.tokenIds(asset.chain, asset.address);
    const result: string[] = [];
    for (let i of ids) {
      result.push(i.id.toDec());
    }
    return result;
  }

  showAmount(): string {
    const asset = this.selectedAsset;
    if (!asset) return '';
    if (asset.isRaicoin) {
      return this.amount.toBalanceStr(new U8(9), true) + ' ' + asset.symbol;
    }

    const info = this.token.accountTokenInfo(asset.chain, asset.address);
    if (!info) return '';
    if (info.type === TokenType._20) {
      return this.amount.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
    } else if (info.type === TokenType._721) {
      return `1 ${info.symbol} (${this.tokenId.toDec()})`;
    } else {
      return '';
    }
  }

  showBalance(): string {
    const asset = this.selectedAsset;
    if (!asset) return '';
    if (asset.isRaicoin) {
       const balance = new U256(this.wallets.balance().value);
       return balance.toBalanceStr(new U8(9), true) + ' ' + asset.symbol;
    }
    const info = this.token.accountTokenInfo(asset.chain, asset.address);
    if (!info) return '';
    return info.balance.toBalanceStr(info.decimals, true) + ' ' + info.symbol;
  }

  transferable(from: string, to: string): boolean {
    if (this.checkAsset()) return false;
    if (this.selectedAsset!.isRaicoin) return true;
    if (!ChainHelper.isRaicoin(this.selectedAsset!.chain)) return true;
    const info = this.token.accountTokenInfo(this.selectedAsset!.chain,
                                             this.selectedAsset!.address);
    if (!info) return false;
    if (info.circulable) return true;
    if (from === info.address || to === info.address) return true;
    return false;
  }

  private makeAssetItem(token: AccountTokenInfo): AssetItem {
    const item = new AssetItem();
    item.chain = token.chain;
    item.address = token.address;
    item.addressRaw = token.addressRaw;
    item.type = TokenHelper.toTypeStr(token.type);
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
    item.address = '';
    item.type = TokenTypeStr._20;
    item.shortAddress = ChainHelper.toChainShown(item.chain);
    item.chainLogo = this.logo.getChainLogo(item.chain);
    item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
    item.symbol = 'RAI';
    item.decimals = new U8(9);
    item.balance = new U256(this.wallets.balance().value);
    item.isRaicoin = true;
    return item;
  }

}

class AssetItem {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256();
  type: string = '';
  shortAddress: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
  symbol: string = '';
  decimals: U8 = new U8();
  balance: U256 = new U256();
  isRaicoin: boolean = false;

  textFormat(): string {
    return `${this.symbol} <${this.shortAddress}>`;
  }
}
