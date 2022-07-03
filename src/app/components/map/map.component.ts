import { Component, OnInit, ViewChild } from '@angular/core';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { U256, TokenTypeStr, ChainHelper, ChainStr } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { Web3Service } from '../../services/web3.service';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit {
  @ViewChild('mapTokenWidget') mapTokenWidget!: TokenWidgetComponent;

  activePanel = 0;

  // map
  inputMapAmount = '';
  inputMapTokenId = '';
  mapAmountStatus = 0;
  mapTokenIdStatus = 0;
  private mapAmount = new U256(0);
  private mapTokenId = new U256(0);

  constructor(
    private notification: NotificationService,
    private translate: TranslateService,
    private wallets: WalletsService,
    private web3: Web3Service
  ) { }

  ngOnInit(): void {
  }

  setPanel(panel: number) {
    this.activePanel = panel;
  }

  onMapTokenChange() {
    this.syncMapAmount();
    this.syncMapTokenId();
  }

  mapTokenType(): string {
    if (!this.mapTokenWidget) return '';

    const token = this.mapTokenWidget.selectedToken;
    if (!token) return '';

    return token.type;
  }

  mapTokenFormat(): string {
    if (!this.mapTokenWidget) return '';

    const token = this.mapTokenWidget.selectedToken;
    if (!token) return '';
    return token.shortTextFormat();
  }

  syncMapAmount() {
    if (this.inputMapAmount === '') {
      this.mapAmountStatus = 0;
      return;
    }

    if (!this.mapTokenWidget) {
      this.mapAmountStatus = 0;
      return;
    }

    const token = this.mapTokenWidget.selectedToken;
    if (!token) {
      this.mapAmountStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._20) {
      this.mapAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(token.decimals);
      this.mapAmount =
        new U256(new BigNumber(this.inputMapAmount).mul(decimalsValue));
      if (this.mapAmount.eq(0)) {
        this.mapAmountStatus = 2;
        return;
      }
      this.mapAmountStatus = 1;
    }
    catch (err) {
      this.mapAmountStatus = 2;
    }
  }

  syncMapTokenId() {
    if (this.inputMapTokenId === '') {
      this.mapTokenIdStatus = 0;
      return;
    }

    const widget = this.mapTokenWidget;
    if (!widget || !widget.selectedToken) {
      this.mapTokenIdStatus = 0;
      return;
    }

    const token = widget.selectedToken;
    if (token.type != TokenTypeStr._721)
    {
      this.mapTokenIdStatus = 0;
      return;
    }

    try {
      this.mapTokenId = new U256(this.inputMapTokenId);
      this.mapTokenIdStatus = 1;
    }
    catch (err) {
      this.mapTokenIdStatus = 2;
    }
  }

  raiShortAccount(): string {
    const account = this.wallets.selectedAccount();
    if (!account) return '';
    return account.shortAddress();
  }

  mapShowConnectWallet(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (ChainHelper.isEvmChain(token.chain)) {
      return !this.walletConnected(token.chain as ChainStr);
    }
    return false;
  }

  mapShowDisconnectWallet(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (ChainHelper.isEvmChain(token.chain)) {
      return this.walletConnected(token.chain as ChainStr);
    }
    return false;
  }

  mapSender(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    if (ChainHelper.isEvmChain(token.chain)) {
      if (!this.web3.connected(token.chain as ChainStr)) {
        return '';
      }
      return this.web3.account();
    }
    return '';
  }

  selectedMapToken(): TokenItem | null {
    if (!this.mapTokenWidget || !this.mapTokenWidget.selectedToken) {
      return null;
    }

    return this.mapTokenWidget.selectedToken;
  }

  async mapConnectWallet() {
    const token = this.selectedMapToken();
    if (!token) return;
    await this.connectWallet(token.chain as ChainStr);
  }

  async connectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.connectWallet(chainStr);
    }
  }

  async mapDisconnectWallet() {
    const token = this.selectedMapToken();
    if (!token) return;
    await this.disconnectWallet(token.chain as ChainStr);
  }

  async disconnectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.disconnectWallet();
    }
  }

  mapWalletConnected(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    return this.walletConnected(token.chain as ChainStr);
  }

  walletConnected(chainStr: ChainStr): boolean {
    if (ChainHelper.isEvmChain(chainStr)) {
      return this.web3.connected(chainStr);
    }
    return false;
  }

  map() {
    const token = this.selectedMapToken();
    if (!token) {
      let msg = marker(`Please select a token`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (token.type == TokenTypeStr._20)
    {
      this.syncMapAmount();
      if (this.mapAmountStatus !== 1) {
        let msg = marker(`Please enter a valid amount`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      this.syncMapTokenId();
      if (this.mapTokenIdStatus !== 1) {
        let msg = marker(`Please enter a valid token id`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${token.type}`);
      return;
    }

    this.activePanel = 2;
  }

  mapConfirm() {
    // todo:
  }

  mapShowAmount(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    return this.showAmount(this.mapAmount, token);
    return '';
  }

  showAmount(amount: U256, token: TokenItem): string {
    if (!token) return '';
    if (token.type == TokenTypeStr._20) {
      return `${amount.toBalanceStr(token.decimals)} ${token.symbol}`;
    } else if (token.type == TokenTypeStr._721) {
      return `1 ${token.symbol}`;
    } else {
      return '';
    }
  }

  mapFromChain(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    return ChainHelper.toChainShown(token.chain as ChainStr);
  }

  currentChain(): string {
    return ChainHelper.toChainShown(environment.current_chain);
  }

  raiAccount(): string {
    return this.wallets.selectedAccountAddress();
  }

}
