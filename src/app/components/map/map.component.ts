import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { U256, TokenTypeStr, ChainHelper, ChainStr } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { Web3Service } from '../../services/web3.service';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { ValidatorService } from '../../services/validator.service';

@Component({
  selector: 'app-map',
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.css']
})
export class MapComponent implements OnInit {
  @ViewChild('mapTokenWidget') mapTokenWidget!: TokenWidgetComponent;

  activePanel: string = Panel.MAP;

  // map
  inputMapAmount = '';
  inputMapTokenId = '';
  selectedMapOriginalChain = '';
  mapAmountStatus = 0;
  mapTokenIdStatus = 0;
  private mapAmount = U256.zero();
  private mapTokenId = U256.zero();
  private mapGasCache: U256 | undefined;
  mapInsufficientFunds = false;

  mapApproveStatus: string = ApproveStatus.NONE;

  private gasTimer: any = null;
  private approveTimer: any = null;

  filterMapToken: any;

  constructor(
    private notification: NotificationService,
    private translate: TranslateService,
    private wallets: WalletsService,
    private web3: Web3Service,
    private validator: ValidatorService
  ) {
    this.filterMapToken = (token: TokenItem) => this.mapAllowedToken(token);
  }

  ngOnInit(): void {
    this.gasTimer = setInterval(() => this.updateGas(), 15000);
  }

  startApproveTimer() {
    if (this.approveTimer !== null) return;
    this.approveTimer = setInterval(() => this.updateApproveStatus(), 5000);
  }

  tryStopApproveTimer() {
    if (!this.approveTimer) return;
    if (this.activePanel == Panel.MAP) {
      if (this.mapApproveStatus != ApproveStatus.APPROVED) return;
    } else if (this.activePanel == Panel.UNMAP) {
      // todo: unmap
    } else {
      // pass
    }
    clearInterval(this.approveTimer);
    this.approveTimer = null;
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.gasTimer) {
      clearInterval(this.gasTimer);
      this.gasTimer = null;
    }
  }

  setPanel(panel: string) {
    this.activePanel = panel as Panel;
  }

  mapOriginalChainChanged(selected: string) {
    if (this.mapTokenWidget) {
      this.mapTokenWidget.clear();
    }
  }

  mapOriginalChains(): string[] {
    return ChainHelper.crossChainStrs(true);
  }

  showChain(chain: string): string {
    return ChainHelper.toChainShown(chain);
  }
  
  onMapTokenChange() {
    this.syncMapAmount();
    this.syncMapTokenId();
    this.mapApproveStatus = ApproveStatus.NONE;
    this.mapCheckApproved();
  }

  mapAllowedToken(token: TokenItem): boolean {
    if (ChainHelper.isRaicoin(token.chain)) {
      return false;
    }
    if (token.chain !== this.selectedMapOriginalChain) {
      return false;
    }
    return true;
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
    if (token.type != TokenTypeStr._721) {
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

  shortMapSender(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    if (ChainHelper.isEvmChain(token.chain)) {
      if (!this.web3.connected(token.chain as ChainStr)) {
        return '';
      }
      const sender = this.web3.account();
      if (!sender) return sender;
      return `${sender.substr(0, 7)}...${sender.substr(-5)}`;
    }
    return '';
  }

  selectedMapToken(): TokenItem | null {
    if (!this.mapTokenWidget || !this.mapTokenWidget.selectedToken) {
      return null;
    }

    return this.mapTokenWidget.selectedToken;
  }

  mapApprovable(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.mapWalletConnected()) return false;
    return this.mapApproveStatus == ApproveStatus.REJECTED
      || this.mapApproveStatus == ApproveStatus.ERROR;
  }

  mapApprove() {
    const token = this.selectedMapToken();
    if (!token) return;
    if (ChainHelper.isEvmChain(token.chain)) {
      this.evmTokenApprove(token.chain, token.address, token.type as TokenTypeStr, token.symbol);
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      return;
    }
    this.startApproveTimer();
  }

  async mapConnectWallet() {
    const token = this.selectedMapToken();
    if (!token) return;
    await this.connectWallet(token.chain as ChainStr);
    this.mapCheckApproved();
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
    this.mapApproveStatus = ApproveStatus.NONE;
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

  mapable(): boolean {
    const token = this.selectedMapToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.mapWalletConnected()) return false;
    if (this.mapApproveStatus != ApproveStatus.APPROVED) return false;
    return true;
  }

  map() {
    const token = this.selectedMapToken();
    if (!token) {
      let msg = marker(`Please select a token`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (token.type == TokenTypeStr._20) {
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

    this.activePanel = Panel.MAP_CONFIRM;
    this.mapGasCache = undefined;
    this.mapInsufficientFunds = false;
    this.updateGas();
    this.validator.addChain(token.chain as ChainStr);
  }

  mapCancel() {
    this.mapGasCache = undefined;
    this.mapInsufficientFunds = false;
    this.activePanel = Panel.MAP;
  }

  mapConfirm() {
    const token = this.selectedMapToken();
    if (!token) return;

    if (this.mapGasCache === undefined) return;
    if (this.mapInsufficientFunds) return;

    if (!this.walletConnected(token.chain as ChainStr)) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.MAP;
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      this.mapFromEvmChain();
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
    }
    this.mapReset();
  }

  mapReset() {
    this.inputMapAmount = '';
    this.inputMapTokenId = '';
    this.selectedMapOriginalChain = '';
    this.mapAmountStatus = 0;
    this.mapTokenIdStatus = 0;
    this.mapAmount = U256.zero();
    this.mapTokenId = U256.zero();
    this.mapGasCache = undefined;
    this.mapInsufficientFunds = false;
    this.mapApproveStatus= ApproveStatus.NONE;  
    this.activePanel = Panel.MAP;
  }

  mapShowAmount(): string {
    const token = this.selectedMapToken();
    if (!token) return '';
    return this.showAmount(this.mapAmount, token);
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

  raiAccountRaw(): U256 | undefined {
    const account = this.raiAccount();
    if (!account) return undefined;
    const raw = new U256();
    const error = raw.fromAccountAddress(account);
    if (error) return undefined;
    return raw;
  }

  mapFeeAndGas(): string {
    const token = this.selectedMapToken();
    if (!token) return '';

    const gas = this.mapGasCache;
    if (!gas) return '';

    const fee = this.getFee(token.chain);
    if (!fee) return '';

    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(token.decimals)} ${token.symbol}`;
  }

  mapCheckApproved() {
    const token = this.selectedMapToken();
    if (!token) return;
    this.mapApproveStatus = ApproveStatus.CHECKING;
    this.checkApproved(token, (status: ApproveStatus, token: TokenItem) => {
      if (token != this.selectedMapToken()) return;
      this.mapApproveStatus = status;
      this.tryStopApproveTimer();
    });
  }

  checkApproved(token: TokenItem, callback: (status: ApproveStatus, token: TokenItem) => void) {
    if (ChainHelper.isNative(token.chain, token.addressRaw)) {
      callback(ApproveStatus.APPROVED, token);
      return;
    }

    if (!this.walletConnected(token.chain as ChainStr)) {
      callback(ApproveStatus.NONE, token);
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      this.checkEvmTokenApproved(token, callback);
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      callback(ApproveStatus.ERROR, token);
    }
  }

  checkEvmTokenApproved(
    token: TokenItem,
    callback: (status: ApproveStatus, token: TokenItem) => void
  ) {
    const coreAddress = Web3Service.getCoreContractAddress(token.chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${token.chain}`);
      callback(ApproveStatus.NONE, token);
      return;
    }

    if (token.type == TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(token.addressRaw.toEthAddress());
      try {
        contract.methods.allowance(this.web3.account(),
          coreAddress).call().then((res: any) => {
            if (res !== '0') {
              callback(ApproveStatus.APPROVED, token);
            } else {
              callback(ApproveStatus.REJECTED, token);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR, token);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR, token);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(token.addressRaw.toEthAddress());
      try {
        contract.methods.isApprovedForAll(this.web3.account(),
          coreAddress).call().then((res: boolean) => {
            if (res) {
              callback(ApproveStatus.APPROVED, token);
            } else {
              callback(ApproveStatus.REJECTED, token);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR, token);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR, token);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${token.type}`);
      callback(ApproveStatus.NONE, token);
    }
  }

  evmTokenApprove(chain: string, address: string, type: TokenTypeStr, symbol: string) {
    const coreAddress = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${chain}`);
      return;
    }

    if (type === TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(address);
      contract.methods.approve(coreAddress, U256.max().to0xHex()).send({
          from: this.web3.account()
        }).then((res: any) => {
          console.log('evmTokenApprove res:', res);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
        });
    } else if (type === TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(address);
      contract.methods.setApprovalForAll(coreAddress, true).send({
          from: this.web3.account()
        }).then((res: any) => {
          console.log('evmTokenApprove res:', res);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
        });
    } else {
      console.error(`Unsupported token type: ${type}`);
      return;
    }
    let msg = marker(`An authorization request was sent to your web3 wallet, please check and approve Raicoin Protocol to use your { symbol }`);
    const param = { 'symbol': symbol };
    this.translate.get(msg, param).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
  }

  updateApproveStatus() {
    if (this.activePanel == Panel.MAP) {
      this.mapCheckApproved();
    } else if (this.activePanel == Panel.UNMAP) {
      // todo
    } else {
      // pass
    }
  }

  updateGas() {
    if (this.activePanel == Panel.MAP_CONFIRM) {
      this.updateMapGas();
    } else if (this.activePanel == Panel.UNMAP_CONFIRM) {
      // todo:
    }
  }

  updateMapGas() {
    const token = this.selectedMapToken();
    if (!token) {
      this.mapGasCache = undefined;
      return;
    }

    if (ChainHelper.isEvmChain(token.chain)) {
      const error = this.evmAfterGetGasPrice(token.chain as ChainStr,
        (price: number) => this.updateEvmMapGas(price));
      if (error) {
        this.mapGasCache = undefined;
        this.mapInsufficientFunds = false;
      }
    }

  }

  updateEvmMapGas(price: number): boolean {
    const token = this.selectedMapToken()!;
    if (!this.web3.connected(token.chain as ChainStr)) return true;
    const fee = this.getFee(token.chain);
    if (!fee) return true;
    if (token.type == TokenTypeStr._20) {
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        try {
          this.web3.evmCoreContract.methods.mapETH(this.mapAmount.to0xHex(),
            this.raiAccountRaw()!.to0xHex(), fee.to0xHex()).estimateGas(
              {
                from: this.web3.account(), value: this.mapAmount.plus(fee).to0xHex()
              }).then((res: number) => {
                const gas = new U256(res).mul(price);
                this.mapGasCache = gas;
                this.mapInsufficientFunds = false;
              }).catch((error: any) => {
                console.error('evmMapGas error:', error);
                this.mapGasCache = undefined;
                this.mapInsufficientFunds = true;
              });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          this.mapGasCache = undefined;
          this.mapInsufficientFunds = false;
          return true;
        }
      } else {
        try {
          this.web3.evmCoreContract.methods.mapERC20(token.addressRaw.toEthAddress(),
            this.mapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
              from: this.web3.account(), value: fee.to0xHex()
            }).then((res: number) => {
              const gas = new U256(res).mul(price);
              this.mapGasCache = gas;
              this.mapInsufficientFunds = false;
            }).catch((error: any) => {
              console.error('evmMapGas error:', error);
              this.mapGasCache = undefined;
              this.mapInsufficientFunds = true;
            });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          this.mapGasCache = undefined;
          this.mapInsufficientFunds = false;
          return true;
        }
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.mapERC721(token.addressRaw.toEthAddress(),
          this.mapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            const gas = new U256(res).mul(price);
            this.mapGasCache = gas;
            this.mapInsufficientFunds = false;
          }).catch((error: any) => {
            console.error('evmMapGas error:', error);
            this.mapGasCache = undefined;
            this.mapInsufficientFunds = true;
          });
      } catch (e) {
        console.error('evmMapGas exception:', e);
        this.mapGasCache = undefined;
        this.mapInsufficientFunds = false;
        return true;
      }
    } else {
      return true;
    }

    return false;
  }

  mapFromEvmChain() {
    const token = this.selectedMapToken()!;
    if (!this.web3.connected(token.chain as ChainStr)) return;
    const fee = this.getFee(token.chain);
    if (!fee) return;

    if (token.type == TokenTypeStr._20) {
      if (ChainHelper.isNative(token.chain, token.addressRaw)) {
        try {
          this.web3.evmCoreContract.methods.mapETH(this.mapAmount.to0xHex(),
            this.raiAccountRaw()!.to0xHex(), fee.to0xHex()).send(
              {
                from: this.web3.account(), value: this.mapAmount.plus(fee).to0xHex()
              }).then((res: any) => {
                console.log(typeof res);
                console.log(res);
              }).catch((error: any) => {
                console.error('evmMapGas error:', error);
              });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          return;
        }
      } else {
        try {
          this.web3.evmCoreContract.methods.mapERC20(token.addressRaw.toEthAddress(),
            this.mapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).send({
              from: this.web3.account(), value: fee.to0xHex()
            }).then((res: any) => {
              console.log(typeof res);
              console.log(res);
            }).catch((error: any) => {
              console.error('evmMapGas error:', error);
            });
        } catch (e) {
          console.error('evmMapGas exception:', e);
          return;
        }
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.mapERC721(token.addressRaw.toEthAddress(),
          this.mapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).send({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: any) => {
            console.log(typeof res);
            console.log(res);
          }).catch((error: any) => {
            console.error('evmMapGas error:', error);
          });
      } catch (e) {
        console.error('evmMapGas exception:', e);
        return;
      }
    } else {
      console.error('mapFromEvmChain: unknown token type:', token.type);
      return;
    }

    let msg = marker(`The MAP request was sent, please check and approve the transaction in your web3 wallet.`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });
  }

  evmAfterGetGasPrice(chain: string, fn: any): boolean {
    if (!this.web3.connected(chain as ChainStr)) return true;
    this.web3.web3?.eth.getGasPrice().then((res: any) => {
      console.log('price:', res);
      fn(res);
    });
    return false;
  }

  getFee(chain: string): U256 | undefined {
    const info = this.validator.chainInfo(chain as ChainStr);
    if (!info) return undefined;
    return info.fee;
  }

}

enum Panel {
  MAP = 'map',
  MAP_CONFIRM = 'map_confirm',
  UNMAP = 'unmap',
  UNMAP_CONFIRM = 'unmap_confirm',
}

enum ApproveStatus {
  NONE = '',
  CHECKING = 'checking',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ERROR = 'error',
}