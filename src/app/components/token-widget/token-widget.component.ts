import { Component, OnInit, Input, ViewChild, ElementRef, HostListener, Output, EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { VerifiedToken, VerifiedTokensService } from '../../services/verified-tokens.service';
import { environment } from '../../../environments/environment';
import { ChainHelper, TokenHelper, TokenTypeStr, U256 } from '../../services/util.service';

@Component({
  selector: 'app-token-widget',
  templateUrl: './token-widget.component.html',
  styleUrls: ['./token-widget.component.css']
})
export class TokenWidgetComponent implements OnInit {
  @Input('raiLabel') label: string = '';
  @Input('raiChangable') changable: boolean = true;

  @Output("raiChange") eventTokenSelected = new EventEmitter<TokenItem | undefined>();

  @ViewChild('tokenDropdown') tokenDropdown! : ElementRef;
  @ViewChild('tokenInput') tokenInput! : ElementRef;
  @ViewChild('tokenSelect') tokenSelect! : ElementRef;

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.changable && this.tokenInput
       && !this.tokenInput.nativeElement.contains(event.target)
       && !this.tokenSelect.nativeElement.contains(event.target)) {
      this.hideSearchResult();
    }
  }

  tokenInputText: string = '';
  selectedToken: TokenItem | undefined;
  tokenFocused: boolean = false;
  searchResultShown: boolean = false;

  private filtedToken: {chain: string, addressRaw: U256} | undefined;
  private allowedTokes: TokenItem[] | undefined;
  private defaultTokens: TokenItem[] | undefined;

  constructor(
    private wallets: WalletsService,
    private logo: LogoService,
    private verified: VerifiedTokensService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  tokenValid(chain: string, addressRaw: U256, type: string): boolean {
    // todo: custom tokens
    const token = this.verified.token(chain, addressRaw);
    if (token && token.type === TokenHelper.toType(type)) return true;
    return false;
  }

  addToken(token: TokenItem, replace: boolean = true) {
    if (replace) {
      this.allowedTokes = [token];
    } else {
      if (!this.allowedTokes) this.allowedTokes = [];
      this.allowedTokes.push(token);
    }
    if (!this.changable) {
      this.selectedToken = token;
      this.tokenInputText = token.textFormat();
    }
  }

  getToken(chain: string, addressRaw: U256, type: string): TokenItem | undefined {
    // todo: custom tokens
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
  }

  onFocus() {
    this.tokenFocused = true;
    this.showSearchResult();
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
    if (this.allowedTokes) return this.allowedTokes;
    if (this.defaultTokens) return this.defaultTokens;

    const result: TokenItem[] = [];
    // todo: add custom tokens
    const custom: TokenItem[] = [];
    for (let i of this.verified.tokens(environment.current_chain)) {
      const chain = ChainHelper.toChainStr(i.chain);
      const existing = custom.find(x => x.chain === chain && x.address == i.address);
      if (existing) continue;
      const item = this.makeTokenItem(i);
      if (!item) continue;
      result.push(item);
    }

    this.defaultTokens = result.filter(item => {
      if (this.tokenInputText.includes('<')) return true;
       return item.symbol.toUpperCase().includes(this.tokenInputText.toUpperCase());
      });

    return this.defaultTokens;
  }

  check(): boolean {
    if (!this.selectedToken || this.tokenStatus() !== 1) {
      this.tokenInput.nativeElement.focus();
      return true;
    }

    return false;
  }

  private makeTokenItem(info: VerifiedToken): TokenItem | undefined {
    const item = new TokenItem();
    item.chain = ChainHelper.toChainStr(info.chain);
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
    item.symbol = info.symbol;
    item.name = info.name;
    item.decimals = info.decimals;
    return item;
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

  textFormat(): string {
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}: ${this.shortAddress}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

  shortTextFormat(): string {
    if (this.address) {
      let tokenType = ChainHelper.tokenTypeShown(this.chain, this.type as TokenTypeStr);
      tokenType = tokenType.replace('-', '');
      return `${this.symbol} <${tokenType}>`; 
    } else {
      return `${this.symbol} <${this.shortAddress}>`;
    }
  }

}