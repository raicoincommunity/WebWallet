import { Component, OnInit, Input, ViewChild, ElementRef, HostListener } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { WalletsService } from '../../services/wallets.service';
import { LogoService } from '../../services/logo.service';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { environment } from '../../../environments/environment';
import { ChainHelper, TokenHelper, TokenTypeStr } from '../../services/util.service';

@Component({
  selector: 'app-token-widget',
  templateUrl: './token-widget.component.html',
  styleUrls: ['./token-widget.component.css']
})
export class TokenWidgetComponent implements OnInit {
  @Input('raiLabel')
  label: string = '';

  @ViewChild('tokenDropdown') tokenDropdown! : ElementRef;
  @ViewChild('tokenInput') tokenInput! : ElementRef;
  @ViewChild('tokenSelect') tokenSelect! : ElementRef;

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent) {
    if (this.tokenInput
       && !this.tokenInput.nativeElement.contains(event.target)
       && !this.tokenSelect.nativeElement.contains(event.target)) {
      this.hideSearchResult();
    }
  }

  tokenInputText: string = '';
  selectedToken: TokenItem | undefined;
  tokenFocused: boolean = false;
  searchResultShown: boolean = false;

  constructor(
    private wallets: WalletsService,
    private logo: LogoService,
    private verified: VerifiedTokensService,
    private translate: TranslateService
  ) { }

  ngOnInit(): void {
  }

  account(): string {
    return this.wallets.selectedAccountAddress();
  }

  clear() {
    this.tokenInputText = '';
    this.selectedToken = undefined;
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
    }
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
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

  selectToken(token: TokenItem) {
    this.selectedToken = token;
    this.tokenInputText = token.textFormat();
    this.hideSearchResult();
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
    for (let token of this.tokens()) {
      if (this.tokenInputText === token.textFormat()) {
        return 1;
      }
    }
    return 2;
  }

  tokens(): TokenItem[] {
    const result: TokenItem[] = [];
    // todo: add custom tokens
    const custom: TokenItem[] = [];
    for (let i of this.verified.tokens(environment.current_chain)) {
      const chain = ChainHelper.toChainStr(i.chain);
      const existing = custom.find(x => x.chain === chain && x.address == i.address);
      if (existing) continue;
      const item = new TokenItem();
      item.chain = chain;
      item.address = i.address;
      item.type = TokenHelper.toTypeStr(i.type);
      if (i.address) {
        item.shortAddress = ChainHelper.toShortAddress(chain, i.address);
      } else {
        item.shortAddress = i.name;
      }
      item.chainLogo = this.logo.getChainLogo(i.chain);
      if (i.address === '') {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, '');
      } else {
        item.tokenLogo = this.logo.getTokenLogo(i.chain, i.address);
      }
      item.symbol = i.symbol;
      item.name = i.name;
      item.decimals = i.decimals;
      result.push(item);
    }

    return result.filter(item => {
      if (this.tokenInputText.includes('<')) return true;
       return item.symbol.toUpperCase().includes(this.tokenInputText.toUpperCase());
      });
  }

}

class TokenItem {
  chain: string = '';
  address: string = '';
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
}