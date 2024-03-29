import { Component, OnInit, Input, ViewChild, ElementRef, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { VerifiedToken, VerifiedTokensService } from '../../services/verified-tokens.service';
import { environment } from '../../../environments/environment';
import { ChainHelper, TokenHelper, TokenTypeStr, U256, U8 } from '../../services/util.service';
import { SettingsService } from '../../services/settings.service'
import { TokenService, AccountTokenInfo } from '../../services/token.service';
import { NotificationService } from '../../services/notification.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

@Component({
  selector: 'app-token-widget',
  templateUrl: './token-widget.component.html',
  styleUrls: ['./token-widget.component.css']
})
export class TokenWidgetComponent implements OnInit {
  @Input('raiLabel') label: string = '';
  @Input('raiChangable') changable: boolean = true;
  @Input('raiMaxItems') maxShownItems: number = 10;
  @Input('raiTokenFilter') tokenFilter: (token: TokenItem) => boolean = () => true;

  @Output("raiChange") eventTokenSelected = new EventEmitter<TokenItem | undefined>();

  @ViewChild('tokenDropdown') tokenDropdown! : ElementRef;
  @ViewChild('tokenInput') tokenInput! : ElementRef;
  @ViewChild('tokenSelect') tokenSelect! : ElementRef;

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.changable && this.tokenInput) {
      if (!this.tokenInput.nativeElement.contains(event.target)
        && !this.tokenSelect.nativeElement.contains(event.target)) {
        this.hideSearchResult();
      } else {
        this.showSearchResult();
      }
    }
  }

  tokenInputText: string = '';
  selectedToken: TokenItem | undefined;
  tokenFocused: boolean = false;
  searchResultShown: boolean = false;

  private filtedToken: {chain: string, addressRaw: U256} | undefined;
  private allowedTokens: TokenItem[] | undefined;
  private defaultTokens: TokenItem[] | undefined;
  private customTokens: TokenItem[] = [];

  constructor(
    private wallets: WalletsService,
    private logo: LogoService,
    private verified: VerifiedTokensService,
    private settings: SettingsService,
    private token: TokenService,
    private notification: NotificationService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
    this.getCustomTokens();
  }

  ngOnChanges() {
    this.clear();
  }   

  tokenValid(chain: string, addressRaw: U256, type: string): boolean {
    const custom = this.getCustomToken(chain, addressRaw, type);
    if (custom) return true;

    const token = this.verified.token(chain, addressRaw);
    if (token && token.type === TokenHelper.toType(type)) return true;
    return false;
  }

  addToken(token: TokenItem, replace: boolean = true) {
    if (replace) {
      this.allowedTokens = [token];
    } else {
      if (!this.allowedTokens) this.allowedTokens = [];
      this.allowedTokens.push(token);
    }
    if (!this.changable) {
      this.selectedToken = token;
      this.tokenInputText = token.textFormat();
    }
  }

  getToken(chain: string, addressRaw: U256, type: string): TokenItem | undefined {
    const custom = this.getCustomToken(chain, addressRaw, type);
    if (custom) return custom;

    const token = this.verified.token(chain, addressRaw);
    if (!token || token.type !== TokenHelper.toType(type)) return undefined;
    return this.makeTokenItem(token);
  }

  account(): string {
    return this.wallets.selectedAccountAddress();
  }

  clear() {
    this.tokenInputText = '';
    this.selectedToken = undefined;
    this.eventTokenSelected.emit(this.selectedToken);
    this.defaultTokens = undefined;
  }

  filtToken(token: {chain: string, addressRaw: U256} | undefined) {
    this.filtedToken = token;
  }

  onRemove() {
    this.clear();
    this.hideSearchResult();
  }

  onFocus() {
    this.tokenFocused = true;
  }

  onBlur() {
    this.tokenFocused = false;
  }

  onChange() {
    if (this.selectedToken && this.selectedToken.textFormat() !== this.tokenInputText) {
      this.selectedToken = undefined;
      this.eventTokenSelected.emit(this.selectedToken);
    }
    this.defaultTokens = undefined;
  }

  showSearchResult() {
    this.searchResultShown = true;
    this.tokenDropdown.nativeElement.classList.add('uk-open');
  }

  hideSearchResult() {
    this.searchResultShown = false;
    this.tokenDropdown.nativeElement.classList.remove('uk-open');
  }

  showLabel(): string {
    let msg = this.label;
    if (!msg) return '';
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

  selectToken(token: TokenItem) {
    this.selectedToken = token;
    this.tokenInputText = token.textFormat();
    this.hideSearchResult();
    this.eventTokenSelected.emit(this.selectedToken);
    this.defaultTokens = undefined;
  }

  style(): string {
    if (this.selectedToken) {
      return "padding-left: 50px; font-weight: bold;"
    } else {
      return this.tokenInputText ? "font-weight: bold;" : "";
    }
  }

  tokenStatus(): number {
    if (!this.tokenInputText) return 0;
    if (this.filtedToken && this.selectedToken) {
      if (this.filtedToken.chain === this.selectedToken.chain && this.filtedToken.addressRaw.eq(this.selectedToken.addressRaw)) {
        return 2;
      }
    }
    for (let token of this.tokens()) {
      if (this.tokenInputText === token.textFormat()) {
        return 1;
      }
    }
    return 2;
  }

  tokens(): TokenItem[] {
    if (this.allowedTokens) return this.allowedTokens;
    if (this.defaultTokens) return this.defaultTokens;

    const result: TokenItem[] = [];
    for (let i of this.customTokens) {
      if (result.length >= this.maxShownItems) break;
      if (!i.type) {
        const tokenInfo = this.token.tokenInfo(i.address, i.chain);
        if (tokenInfo) {
          i.type = TokenHelper.toTypeStr(tokenInfo.type);
        } else {
          this.token.queryTokenInfo(i.chain, i.address, false);
        }
        continue;
      }
      if (this.filter(i)) {
        result.push(i);
      }
    }

    for (let i of this.verified.tokens(environment.current_chain)) {
      if (result.length >= this.maxShownItems) break;
      const chain = ChainHelper.toChainStr(i.chain);
      const existing = result.find(x => x.chain === chain && x.address == i.address);
      if (existing) continue;
      const item = this.makeTokenItem(i);
      if (!item) continue;
      if (this.filter(item)) {
        result.push(item);
      }
    }

    for (let i of this.token.tokens()) {
      if (result.length >= this.maxShownItems) break;
      const existing = result.find(x => x.chain === i.chain && x.address == i.address);
      if (existing) continue;
      const item = this.makeTokenItem(i);
      if (!item) continue;
      if (this.filter(item)) {
        result.push(item);
      }
    }

    this.defaultTokens = result
    return this.defaultTokens;
  }

  check(): boolean {
    if (!this.selectedToken || this.tokenStatus() !== 1) {
      this.tokenInput.nativeElement.focus();
      return true;
    }

    return false;
  }

  address(): string {
    return this.wallets.selectedAccountAddress();
  }

  copy(): string {
    if (!this.selectedToken) return '';
    return this.selectedToken.address;
  }

  copied() {
    const address = this.copy();
    if (!address) return;
    let msg = marker('Token address copied to clipboard: {address}');
    const param = {address};
    this.translate.get(msg, param).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  private filter(item: TokenItem): boolean {
    if (!this.tokenFilter(item)) return false;
    if (this.tokenInputText.includes('<')) {
      return item.textFormat().includes(this.tokenInputText)
    };
    return item.symbol.toUpperCase().includes(this.tokenInputText.trim().toUpperCase());
  }

  private getCustomToken(chain: string, addressRaw: U256, type: string): TokenItem | undefined {
    for (let i of this.customTokens) {
      if (i.chain === chain && i.addressRaw.eq(addressRaw)) {
        if (!i.type) {
          const tokenInfo = this.token.tokenInfo(i.address, i.chain);
          if (tokenInfo) {
            i.type = TokenHelper.toTypeStr(tokenInfo.type);
          } else {
            this.token.queryTokenInfo(i.chain, i.address, false);
          }
        }
        if (i.type === type) return i;
      }
    }

    return undefined;
  }

  private getCustomTokens() {
    for (let i of this.settings.getAssets(this.address())) {
      const item =  new TokenItem();
      item.chain = i.chain;
      item.address = i.address;
      const ret = ChainHelper.addressToRaw(item.chain, item.address);
      if (ret.error) {
        console.error(`getCustomTokens: Failed to get raw address, chain=${item.chain}, address=${item.address }`);
        continue;
      }
      item.addressRaw = ret.raw!;
      const verified = this.verified.token(i.chain, i.address);
      item.symbol = verified?.symbol || i.symbol;
      item.name = verified?.name || i.name;
      item.decimals = +i.decimals;
        item.type = i.type || '';
      if (!item.type) {
        const tokenInfo = this.token.tokenInfo(i.address, i.chain);
        if (tokenInfo) {
          item.type = TokenHelper.toTypeStr(tokenInfo.type);
        } else {
          this.token.queryTokenInfo(i.chain, i.address, true);
        }
      }
      item.chainLogo = this.logo.getChainLogo(item.chain);
      if (ChainHelper.isNative(item.chain, item.addressRaw)) {
        item.address = '';
        item.shortAddress = i.name;
        item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
      } else {
        item.shortAddress = ChainHelper.toShortAddress(item.chain, item.address);
        item.tokenLogo = this.logo.getTokenLogo(item.chain, item.address);
      }
      this.customTokens.push(item);
    }
  }

  private makeTokenItem(info: VerifiedToken | AccountTokenInfo): TokenItem | undefined {
    const item = new TokenItem();
    if (typeof info.chain === 'string') {
      item.chain = info.chain;
    } else {
      item.chain = ChainHelper.toChainStr(info.chain);
    }
    item.address = info.address;
    const ret = ChainHelper.addressToRaw(item.chain, item.address);
    if (ret.error) {
      console.error(`makeTokenItem: Failed to get raw address, chain=${item.chain}, address=${item.address }`);
      return undefined;
    }
    item.addressRaw = ret.raw!;
    item.type = TokenHelper.toTypeStr(info.type);
    if (info.address) {
      item.shortAddress = ChainHelper.toShortAddress(item.chain, info.address);
    } else {
      item.shortAddress = info.name;
    }
    item.chainLogo = this.logo.getChainLogo(info.chain);
    if (info.address === '') {
      item.tokenLogo = this.logo.getTokenLogo(item.chain, '');
    } else {
      item.tokenLogo = this.logo.getTokenLogo(item.chain, info.address);
    }
    item.symbol = info.symbol || this.queryTokenSymbol(item.chain, item.address);
    item.name = info.name || this.queryTokenName(item.chain, item.address);
    if (info.decimals instanceof U8) {
      item.decimals = info.decimals.toNumber();
    } else {
      item.decimals = info.decimals;
    }
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

  private queryTokenName(chain: string, address: string, fallback: string = ''): string {
    const verified = this.verified.token(chain, address);
    if (verified) {
      return verified.name;
    }
    
    const account = this.wallets.selectedAccountAddress();
    const asset = this.settings.getAsset(account, chain, address);
    if (asset !== undefined) {
      return asset.name;
    }

    const tokenInfo = this.token.tokenInfo(address, chain);
    if (tokenInfo && tokenInfo.name) {
      return tokenInfo.name;
    }
    
    const name = this.token.tokenName(address, chain);
    if (name) return name;
    this.token.queryTokenName(chain, address, false);

    return fallback;
  }

}

export class TokenItem {
  chain: string = '';
  address: string = '';
  addressRaw: U256 = new U256(0);
  type: string = '';
  shortAddress: string = '';
  chainLogo: string = '';
  tokenLogo: string = '';
  symbol: string = '';
  name: string = '';
  decimals: number = 0;

  private formatted: string = '';
  private shortFormatted: string = '';

  textFormat(): string {
    if (this.formatted) return this.formatted;
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      this.formatted = `${this.symbol} <${tokenType}: ${this.shortAddress}>`; 
    } else {
      this.formatted = `${this.symbol} <${this.shortAddress}>`;
    }
    return this.formatted;
  }

  shortTextFormat(): string {
    if (this.shortFormatted) return this.shortFormatted;
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      this.shortFormatted = `${this.symbol} <${tokenType}>`; 
    } else {
      this.shortFormatted = `${this.symbol} <${this.shortAddress}>`;
    }
    return this.shortFormatted;
  }

  eq(other: TokenItem): boolean {
    return this.chain === other.chain
      && this.address === other.address
      && this.type === other.type;
  }

}