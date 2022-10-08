import { Component, OnInit, ViewChild, ElementRef, HostListener, Input, Output, EventEmitter } from '@angular/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { ChainHelper, U256, U8, TokenTypeStr, TokenHelper } from '../../services/util.service';
import { TokenService, AccountTokenInfo } from '../../services/token.service';
import { environment } from '../../../environments/environment';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenType } from '../../services/util.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import  { SettingsService, AssetSetting } from '../../services/settings.service';

@Component({
  selector: 'app-asset-widget',
  templateUrl: './asset-widget.component.html',
  styleUrls: ['./asset-widget.component.css']
})
export class AssetWidgetComponent implements OnInit {
  @Input('raiAmountHint') defualtAmountHint: string = marker('The amount to send');
  @Input('raiShowRaicoin') showRaicoin: boolean = true;
  @Input('raiAssetFilter') assetFilter: (token: AssetItem) => boolean = () => true;
  @Output("raiChange") eventAssetSelected = new EventEmitter<AssetItem | undefined>();

  @ViewChild('assetDropdown') assetDropdown! : ElementRef;
  @ViewChild('assetInput') assetInput! : ElementRef;
  @ViewChild('assetSelect') assetSelect! : ElementRef;

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.assetInput) {
      if (!this.assetInput.nativeElement.contains(event.target)
        && !this.assetSelect.nativeElement.contains(event.target)) {
        this.hideSearchResult();
      } else {
        this.showSearchResult();
      }
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
    private verified: VerifiedTokensService,
    private settings: SettingsService,
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
  }

  onBlur() {
    this.assetFocused = false;
  }

  onChange() {
    if (this.selectedAsset && this.selectedAsset.textFormat() !== this.assetInputText) {
      this.selectedAsset = undefined;
      this.eventAssetSelected.emit(this.selectedAsset);
    }
    this.showSearchResult();
  }

  showSearchResult() {
    this.searchResultShown = true;
    this.assetDropdown.nativeElement.classList.add('uk-open');
  }

  hideSearchResult() {
    this.searchResultShown = false;
    this.assetDropdown.nativeElement.classList.remove('uk-open');
  }

  address(): string {
    return this.wallets.selectedAccountAddress();
  }

  assets(): AssetItem[] {
    const items: AssetItem[] = [];
    if (this.wallets.selectedAccount()?.synced && this.showRaicoin) {
      items.push(this.defautlAssetItem());
    }
    if (this.token.synced(this.selectedAccount())) {
      const tokens = this.token.tokens(this.selectedAccount());
      for (let token of tokens) {
        items.push(this.makeAssetItem(token));
      }  
    }
    for (let i of this.settings.getAssets(this.address())) {
      const existing = items.find(x => x.chain === i.chain && x.address == i.address);
      if (existing) continue;
      items.push(this.makeAssetItem(i));
    }
    return items.filter(item => {
      if (!this.assetFilter(item)) return false;
      if (this.assetInputText === '' || this.assetInputText.includes('<')) return true;
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
    this.eventAssetSelected.emit(this.selectedAsset);
  }

  selectAssetByTokenAddress(chain: string, address: string) {
    for (let asset of this.assets()) {
      if (asset.chain === chain && asset.address === address) {
        this.selectAsset(asset);
        return;
      }
    }
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
    const balance = this.showBalance();
    if (!balance) {
      let msg = this.defualtAmountHint;
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    } else {
      let msg = marker(`Balance`);
      this.translate.get(msg).subscribe(res => msg = res);
      return `${msg}: ${balance}`;
    }
  }

  checkAsset(): boolean {
    if (this.assetStatus() !== 1 || !this.selectedAsset
      || this.selectedAsset.textFormat() !== this.assetInputText) {
      return true;
    }
    return false;
  }

  check(autoFocus: boolean = true): boolean {
    if (this.checkAsset()) {
      if (!this.assetInputText && autoFocus) {
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
    this.selectedTokenId = '';
    this.eventAssetSelected.emit(this.selectedAsset);
  }

  clearAmount() {
    this.amountInputText = '';
    this.amountStatus = 0;
    this.amount = new U256();
    this.selectedTokenId = '';
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

    const symbol = asset.symbol;
    const info = this.token.accountTokenInfo(asset.chain, asset.address);
    if (!info) return '';
    if (info.type === TokenType._20) {
      return this.amount.toBalanceStr(info.decimals, true) + ' ' + symbol;
    } else if (info.type === TokenType._721) {
      return `1 ${symbol} (${this.tokenId.toDec()})`;
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
    return info.balance.toBalanceStr(info.decimals, true) + ' ' + asset.symbol;
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

  private makeAssetItem(token: AccountTokenInfo | AssetSetting): AssetItem {
    const item = new AssetItem();
    if (token instanceof AccountTokenInfo) {
      item.chain = token.chain;
      item.address = token.address;
      item.addressRaw = token.addressRaw;
      item.type = TokenHelper.toTypeStr(token.type);
      item.isNative = token.addressRaw.isNativeTokenAddress();
      if (item.isNative) {
        const verified = this.verified.getNativeToken(item.chain);
        if (verified) {
          item.shortAddress = verified.name;
        }
        item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
      } else {
        item.shortAddress = ChainHelper.toShortAddress(item.chain, item.address);
        item.tokenLogo = this.logo.getTokenLogo(item.chain, item.address);
      }
      item.chainLogo = this.logo.getChainLogo(item.chain);
      item.symbol = this.queryTokenSymbol(token.chain, token.address, token.symbol);
      item.decimals = token.decimals;
      item.balance = token.balance;  
    } else {
      item.chain = token.chain;
      item.address = token.address;
      const ret = ChainHelper.addressToRaw(item.chain, item.address);
      if (ret.error) {
        throw new Error(`makeAssetItem: address to raw failed, chain=${item.chain}, address=${item.chain}`);
      }
      item.addressRaw = ret.raw!;
      item.type = token.type;
      item.isNative = item.addressRaw.isNativeTokenAddress();
      if (item.isNative) {
        const verified = this.verified.getNativeToken(item.chain);
        if (verified) {
          item.shortAddress = verified.name;
        }
        item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
      } else {
        item.shortAddress = ChainHelper.toShortAddress(item.chain, item.address);
        item.tokenLogo = this.logo.getTokenLogo(item.chain, item.address);
      }
      item.chainLogo = this.logo.getChainLogo(item.chain);
      item.symbol = this.queryTokenSymbol(token.chain, token.address, token.symbol);
      item.decimals = new U8(token.decimals);
      item.balance = U256.zero();  
    }
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
    item.isNative = true;
    return item;
  }

  private queryTokenSymbol(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.symbol;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.symbol;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.symbol) {
      return tokenInfo.symbol;
    }
    
    const symbol = this.token.tokenSymbol(address, chain);
    if (symbol) return symbol;
    this.token.queryTokenSymbol(chain, address, false);

    return fallback;
  }

}

export class AssetItem {
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
  isNative: boolean = false;

  textFormat(): string {
    if (!this.isNative) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}: ${this.shortAddress}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

  shortTextFormat(): string {
    if (!this.isNative) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

}
