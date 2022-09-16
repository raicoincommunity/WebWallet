import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { AssetWidgetComponent, AssetItem } from '../asset-widget/asset-widget.component';
import { U256, TokenTypeStr, ChainHelper, ChainStr, ExtensionTokenOpStr, ExtensionTypeStr,
  TokenType, ZX, EVM_ZERO_ADDRESS } from '../../services/util.service';
import { WalletsService, WalletErrorCode } from '../../services/wallets.service';
import { ValidatorService } from '../../services/validator.service';
import { Web3Service } from '../../services/web3.service';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TranslateService } from '@ngx-translate/core';
import { NotificationService } from '../../services/notification.service';
import { TokenWidgetComponent, TokenItem } from '../token-widget/token-widget.component';
import { VerifiedTokensService } from '../../services/verified-tokens.service';
import { TokenService } from '../../services/token.service';
import { BigNumber } from 'bignumber.js';

@Component({
  selector: 'app-wrap',
  templateUrl: './wrap.component.html',
  styleUrls: ['./wrap.component.css']
})
export class WrapComponent implements OnInit {
  @ViewChild('wrapAssetWidget') wrapAssetWidget! : AssetWidgetComponent;
  @ViewChild('unwrapTokenWidget') unwrapTokenWidget!: TokenWidgetComponent;

  activePanel: string = Panel.WRAP;

  // wrap
  selectedWrapTargetChain = '';
  wrapInsufficientFunds = false;
  private wrapTargetChainsCache?: ChainStr[] = undefined;
  private wrapGasCache: U256 | undefined;
  private wrapContractStatus = new WrapContractStatusContainer();
  private web3Subscription: any;

  // unwrap
  selectedUnwrapSourceChain = '';
  unwrapTokenFilter: any;
  inputUnwrapAmount = '';
  inputUnwrapTokenId = '';
  unwrapAmountStatus = 0;
  unwrapTokenIdStatus = 0;
  unwrapApproveStatus: string = ApproveStatus.NONE;
  unwrapInsufficientFunds = false;
  private unwrapAmount = U256.zero();
  private unwrapTokenId = U256.zero();
  private approveCheckingSince: number | undefined;
  private unwrapGasCache: U256 | undefined;
  private unwrapContractStatus = new WrapContractStatusContainer();


  // timers
  private gasTimer: any = null;
  private approveTimer: any = null;
  private wrapContractStatusTimer: any = null;
  private unwrapContractStatusTimer: any = null;


  constructor(
    private wallets: WalletsService,
    private validator: ValidatorService,
    private web3: Web3Service,
    private translate: TranslateService,
    private notification: NotificationService,
    private verified: VerifiedTokensService,
    private token: TokenService
  ) {
    this.unwrapTokenFilter = (token: TokenItem) => this.unwrapAllowedToken(token);
  }

  ngOnInit(): void {
    this.web3Subscription = this.web3.accountChanged$.subscribe(e => {
      this.wrapTargetChainChanged(this.selectedWrapTargetChain);
    });
  }

  @HostListener('unloaded')
  ngOnDestroy() {
    if (this.web3Subscription) {
      this.web3Subscription.unsubscribe();
      this.web3Subscription = null;
    }
    if (this.gasTimer) {
      clearInterval(this.gasTimer);
      this.gasTimer = null;
    }
    if (this.approveTimer) {
      clearInterval(this.approveTimer);
      this.approveTimer = null;
    }
    if (this.wrapContractStatusTimer) {
      clearInterval(this.wrapContractStatusTimer);
      this.wrapContractStatusTimer = null;
    }
    if (this.unwrapContractStatusTimer) {
      clearInterval(this.unwrapContractStatusTimer);
      this.unwrapContractStatusTimer = null;
    }
  }

  startWrapContractStatusTimer() {
    if (this.wrapContractStatusTimer !== null) return;
    this.wrapContractStatusTimer = setInterval(() => {
      this.processWrapContractStatusTimer();
    }, 5000);
  }

  processWrapContractStatusTimer() {
    if (!this.wrapContractStatusTimer) return;
    do {
      if (this.activePanel != Panel.WRAP) break;
      const asset = this.wrapSelectedAsset();
      if (!asset) break;
      const chain = this.selectedWrapTargetChain;
      if (!chain) break;
      if (this.wrapShowConnectWallet()) break;
      const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
      if (!status || status.created) break;
      this.wrapSyncContractStatus(asset, chain);
      if (status.created === false) {
        this.wrapSignCreation(asset, chain);
      }
      return;
    } while (0);

    clearInterval(this.wrapContractStatusTimer);
    this.wrapContractStatusTimer = null;
  }

  startGasTimer() {
    if (this.gasTimer !== null) return;
    this.gasTimer = setInterval(() => {
      if (!this.gasTimer) return
      if (this.activePanel != Panel.WRAP_CONFIRM && this.activePanel != Panel.UNWRAP_CONFIRM) {
        clearInterval(this.gasTimer);
        this.gasTimer = null;
        return
      }
      this.updateGas();
    }, 5000);
  }

  startApproveTimer() {
    if (this.approveTimer !== null) return;
    this.approveTimer = setInterval(() => this.updateApproveStatus(), 5000);
  }

  tryStopApproveTimer() {
    if (!this.approveTimer) return;
    if (this.activePanel == Panel.UNWRAP) {
      if (this.unwrapApproveStatus === ApproveStatus.CHECKING
        || this.unwrapApproveStatus === ApproveStatus.WAITING) {
          return;
        }
    } else {
      // pass
    }
    clearInterval(this.approveTimer);
    this.approveTimer = null;
  }

  updateApproveStatus() {
    if (this.activePanel == Panel.UNWRAP) {
      this.unwrapCheckApproved();
    } else {
      // pass
    }
  }


  startUnwrapContractStatusTimer() {
    if (this.unwrapContractStatusTimer !== null) return;
    this.unwrapContractStatusTimer = setInterval(() => {
      this.processUnwrapContractStatusTimer();
    }, 5000);
  }

  processUnwrapContractStatusTimer() {
    if (!this.unwrapContractStatusTimer) return;
    do {
      if (this.activePanel != Panel.UNWRAP) break;
      const token = this.unwrapSelectedToken();
      if (!token) break;
      const chain = this.selectedUnwrapSourceChain;
      if (!chain) break;
      if (this.unwrapShowConnectWallet()) break;
      const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
      if (!status || status.created) break;
      this.unwrapSyncContractStatus(token, chain);
      return;
    } while (0);

    clearInterval(this.unwrapContractStatusTimer);
    this.unwrapContractStatusTimer = null;
  }

  setPanel(panel: string) {
    this.activePanel = panel as Panel;
  }

  onWrapAssetChanged() {
    this.wrapTargetChainsCache = undefined;
    this.selectedWrapTargetChain = '';
  }

  showChain(chain: string): string {
    return ChainHelper.toChainShown(chain);
  }

  wrapSelectedAsset(): AssetItem | undefined {
    if (!this.wrapAssetWidget) return undefined;
    return this.wrapAssetWidget.selectedAsset;
  }

  wrapOriginalChain(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    return this.showChain(asset.chain);
  }

  wrapTargetChainChanged(selected: string) {
    if (!selected) return;
    const asset = this.wrapSelectedAsset();
    if (!asset) return;
    let status = this.wrapContractStatus.get(asset.chain, asset.address, selected);
    if (!status) {
      status = new WrapContractStatus();
      this.wrapContractStatus.add(asset.chain, asset.address, selected, status);
    }
    this.wrapSyncContractStatus(asset, selected);
    this.startWrapContractStatusTimer();
  }

  wrapTargetChains(): string[] {
    if (this.wrapTargetChainsCache === undefined) {
      this.wrapTargetChainsCache = [];
      const asset = this.wrapSelectedAsset();
      if (asset) {
        const chains = ChainHelper.crossChainStrs(false);
        for (let chain of chains) {
          if (chain != asset.chain) {
            this.wrapTargetChainsCache.push(chain);
          }
        }
      }
    }
    return this.wrapTargetChainsCache;
  }

  wrapRecipient(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    if (ChainHelper.isEvmChain(chain)) {
      if (!this.web3.connected(chain as ChainStr)) {
        return '';
      }
      const account = this.web3.account();
      return ChainHelper.formatAddress(chain, account);
    }
    return '';
  }

  wrapShowTargetChain(): string {
    if (!this.selectedWrapTargetChain) return '';
    return ChainHelper.toChainShown(this.selectedWrapTargetChain);
  }

  wrapContract(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    let status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status || !status.created) return '';
    return status.address!;
  }

  shortWrapContract(): string {
    const asset = this.wrapSelectedAsset();
    if (!asset) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const contract = this.wrapContract();
    if (!contract) return '';
    const short = ChainHelper.toShortAddress(chain, contract, 5);
    return `r${asset.symbol} <${short}>`;
  }

  wrapContractCopied() {
    let msg = marker(`The wrap contract address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  shortWrapRecipient(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const recipient = this.wrapRecipient();
    if (!recipient) return '';
    return ChainHelper.toShortAddress(chain, recipient, 5);
  }

  wrapable(): boolean {
    return !this.wrapCheck();
  }

  wrapWalletConnected(): boolean {
    if (!this.selectedWrapTargetChain) return false;
    return this.walletConnected(this.selectedWrapTargetChain as ChainStr);
  }

  wrapShowConnectWallet(): boolean {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return !this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async wrapConnectWallet() {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;
    await this.connectWallet(chain as ChainStr);
  }

  wrapShowDisconnectWallet(): boolean {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async wrapDisconnectWallet() {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;
    await this.disconnectWallet(chain as ChainStr);
  }

  queryEvmChainWrapContractStatus(chain: string, address: string, targetChain: string,
    callback: (error: boolean, address?: string) => void): boolean {
    if (!this.web3.connected(targetChain as ChainStr)) return true;

    try {
      const chainId = ChainHelper.toChain(chain);
      this.web3.evmCoreContract.methods.wrappedToken(chainId, address).call(
          {
            from: this.web3.account()
          }).then((res: any) => {
            const address = new U256(res, 16).toEthAddress();
            console.log(address);
            callback(false, address);
          }).catch((error: any) => {
            console.error('queryEvmChainWrapContractStatus error:', error);
            callback(true);
          });
    } catch (e) {
      console.error('queryEvmChainWrapContractStatus exception:', e);
      return true;
    }
    return false;
  }

  syncContractStatus(
    chain: string,
   address: string,
   targetChain: string,
   status: WrapContractStatus,
   callback: (error: boolean, status: WrapContractStatus) => void
  ) {
    if (status.created === true) return;
    const now = window.performance.now();
    if (status.lastQuery !== undefined && status.lastQuery + 5000 > now) {
      return;
    }
    if (ChainHelper.isEvmChain(targetChain)) {
      this.queryEvmChainWrapContractStatus(chain, address, targetChain, (error, address) => {
        if (!error) {
          status.created = address !== EVM_ZERO_ADDRESS;
          status.address = address;
        }
        callback(error, status);
      });
    } else {
      console.error(`syncContractStatus: unknow target chain, ${targetChain}`);
    }

    status.lastQuery = now;
  }

  wrapSyncContractStatus(asset: AssetItem, targetChain: string) {
    const status = this.wrapContractStatus.get(asset.chain, asset.address, targetChain);
    if (!status) return;
    this.syncContractStatus(asset.chain, asset.address, targetChain, status, (error, status) => {
      if (status.created === false) {
        this.wrapSignCreation(asset, targetChain);
      }
    });
  }

  wrapSignCreation(asset: AssetItem, chain: string) {
    const originalContract = asset.addressRaw.to0xHex();
    if (!this.validator.signingCreation(asset.chain, originalContract, chain)) {
      this.validator.signCreation(asset.chain, asset.addressRaw.to0xHex(), chain, asset.type,
        asset.decimals.toNumber());
    }
  }

  wrapFetchingData(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return false;
    if (this.wrapShowConnectWallet()) return false;
    return status.created === undefined;
  }

  wrapCollectingSignatures(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return false;
    if (this.wrapShowConnectWallet()) return false;
    if (status.created !== false) return false;
    const originalContract = asset.addressRaw.to0xHex();
    const signing = this.validator.signingCreation(asset.chain, originalContract, chain);
    if (!signing) return false;
    const percent = this.validator.creationSignedPercent(asset.chain, originalContract, chain);
    if (percent > 51) return false;
    return true;
  }

  wrapContractCreated(): boolean | undefined {
    const asset = this.wrapSelectedAsset();
    if (!asset) return undefined;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return undefined;
    const status = this.wrapContractStatus.get(asset.chain, asset.address, chain);
    if (!status) return undefined;

    return status.created;
  }

  wrapContractCreatable(): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return false;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return false;
    const created = this.wrapContractCreated();
    if (created !== false) {
      return false;
    }
    if (this.wrapShowConnectWallet()) return false;
    const originalContract = asset.addressRaw.to0xHex();
    const percent = this.validator.creationSignedPercent(asset.chain, originalContract, chain);
    if (percent <= 51) return false;

    // todo: check if meet all requirements

    return false;
  }

  create() {
    // todo:
  }

  wrapCheck(): boolean {
    if (!this.raiAccount()) return true;
    if (!this.wrapAssetWidget) return true;
    if (this.wrapAssetWidget.check()) return true;
    if (!this.selectedWrapTargetChain) return true;
    if (!this.wrapWalletConnected()) return true;
    if (!this.wrapContractCreated()) return true;
    return false;
  }

  wrap() {
    const asset = this.wrapSelectedAsset();
    if (!asset) {
      let msg = marker(`Please select an asset`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }
    if (this.wrapCheck()) return;
    const wallet = this.wallets.selectedWallet();
    if (!wallet) return;

    this.validator.addChain(this.selectedWrapTargetChain as ChainStr);

    const doWhenUnlocked = () => {
      this.activePanel = Panel.WRAP_CONFIRM;
      this.wrapGasCache = undefined;
      this.updateGas();
      this.startGasTimer();
    };

    if (wallet.locked()) {
      this.wallets.tryInputPassword(() => doWhenUnlocked());
      return;
    }
    doWhenUnlocked();
  }

  wrapCancel() {
    this.wrapGasCache = undefined;
    this.wrapInsufficientFunds = false;
    this.activePanel = Panel.WRAP;
  }

  wrapConfirm() {
    if (!this.wrapWalletConnected()) {
      let msg = marker(`Your web3 wallet is not connected.`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      this.activePanel = Panel.WRAP;
      return;
    }

    if (this.wrapCheck()) return;
    const widget = this.wrapAssetWidget;
    if (!widget) return;
    const asset = this.wrapSelectedAsset();
    if (!asset) return;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;

    if (this.wrapGasCache === undefined) return;
    if (this.wrapInsufficientFunds) return;

    let ret = ChainHelper.addressToRaw(chain, this.wrapRecipient());
    if (ret.error) return;
    const to = ret.raw!;

    let value: any = {
      op: ExtensionTokenOpStr.WRAP,
      chain: asset.chain,
      type: asset.type,
      address_raw: asset.addressRaw.toHex(),
      to_chain: chain,
      to_account_raw: to.toHex(),
    };
    if (asset.type === TokenTypeStr._20) {
      value.value = widget.amount.toDec();
    } else if (asset.type === TokenTypeStr._721) {
      value.value = widget.tokenId.toDec();
    } else {
      console.error(`wrapConfirm:Unknown type=${asset.type}`);
      return;
    }
    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.token.change(this.raiAccount(), extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`[1/2] Sending {wrap} block to {raicoin} network`);
    const param = { 'wrap': 'WRAP', 'raicoin': 'Raicoin' };
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg);

    this.wrapReset();
  }

  wrapReset() {
    if (this.wrapAssetWidget) {
      this.wrapAssetWidget.clear();
    }
    this.wrapGasCache = undefined;
    this.wrapInsufficientFunds = false;
    this.activePanel = Panel.WRAP;
  }

  wrapShowAmount(showTokenId: boolean = false): string {
    const widget = this.wrapAssetWidget;
    if (!widget) return '';
    const asset = widget.selectedAsset;
    if (!asset) return '';
    if (asset.type == TokenTypeStr._20) {
      return this.showAmount(widget.amount, asset);
    } else if (asset.type == TokenTypeStr._721) {
      return this.showAmount(widget.tokenId, asset, showTokenId);
    }
    return '';
  }

  wrapShowTargetAmount(): string {
    const widget = this.wrapAssetWidget;
    if (!widget) return '';
    const asset = widget.selectedAsset;
    if (!asset) return '';
    if (asset.type == TokenTypeStr._20) {
      return this.showAmount(widget.amount, asset);
    } else if (asset.type == TokenTypeStr._721) {
      return this.showAmount(widget.tokenId, asset, false, true);
    }
    return '';
  }

  wrapShowOriginalChain(): string {
    const asset =  this.wrapSelectedAsset();
    if (!asset) return '';
    return ChainHelper.toChainShown(asset.chain);
  }

  wrapOriginalTokenAddress(): string {
    const asset =  this.wrapSelectedAsset();
    if (!asset) return '';
    return asset.address;
  }

  raiAccount(): string {
    return this.wallets.selectedAccountAddress();
  }

  raiShortAccount(): string {
    const account = this.wallets.selectedAccount();
    if (!account) return '';
    return account.shortAddress();
  }

  showAmount(
    amount: U256,
    token: TokenItem | AssetItem,
    showTokenId: boolean = false,
    wrapped: boolean = false
  ): string {
    if (!token) return '';
    let symbol = token.symbol;
    if (wrapped) {
      symbol = 'r' + symbol;
    }
    if (token.type == TokenTypeStr._20) {
      return `${amount.toBalanceStr(token.decimals)} ${symbol}`;
    } else if (token.type == TokenTypeStr._721) {
      if (showTokenId) {
        return `1 ${symbol} (${amount})`;
      } else {
        return `1 ${symbol}`;
      }
    } else {
      return '';
    }
  }

  walletConnected(chainStr: ChainStr): boolean {
    if (ChainHelper.isEvmChain(chainStr)) {
      return this.web3.connected(chainStr);
    }
    return false;
  }

  async connectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.connectWallet(chainStr);
    }
  }

  async disconnectWallet(chainStr: ChainStr) {
    if (ChainHelper.isEvmChain(chainStr)) {
      await this.web3.disconnectWallet();
    }
  }

  wrapFeeAndGas(): string {
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';

    const nativeToken = this.verified.getNativeToken(chain);
    if (!nativeToken) return '';

    const gas = this.wrapGasCache;
    if (!gas) return '';
    const fee = this.getFee(chain);
    if (!fee) return '';
    const sum = gas.plus(fee);

    return `${sum.toBalanceStr(nativeToken.decimals)} ${nativeToken.symbol}`;
  }

  updateGas() {
    if (this.activePanel == Panel.WRAP_CONFIRM) {
      this.updateWrapGas();
    } else if (this.activePanel == Panel.UNWRAP_CONFIRM) {
      this.updateUnwrapGas();
    }
  }

  updateWrapGas() {
    const asset = this.wrapSelectedAsset();
    const chain = this.selectedWrapTargetChain;
    if (!asset || !chain) {
      this.wrapGasCache = undefined;
      return;
    }
    
    if (ChainHelper.isEvmChain(chain)) {
      const error = this.evmAfterGetGasPrice(chain as ChainStr,
        (price: number) => this.updateEvmWrapGas(price));
      if (error) {
        this.wrapGasCache = undefined;
        this.wrapInsufficientFunds = false;
      }
    }
  }

  updateEvmWrapGas(price: number): boolean {
    const asset = this.wrapSelectedAsset();
    if (!asset) return true;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return true;
    if (!this.web3.connected(chain as ChainStr)) return true;
    const recipient = this.wrapRecipient();
    if (!recipient) return true;
    const fee = this.getFee(chain);
    if (!fee) return true;
    let gasEst = 0;
    if (asset.type == TokenTypeStr._20) {
        // todo:
        gasEst = 50000;
    } else if (asset.type == TokenTypeStr._721) {
        // todo:
        gasEst = 50000;
    } else {
      return true;
    }
    try {
      this.web3.web3?.eth.getBalance(recipient).then((res: string) => {
        this.wrapGasCache = new U256(gasEst).mul(price);
        console.log(`fee.plus(this.wrapGasCache).gt(res)=`, fee.plus(this.wrapGasCache).gt(res));
        this.wrapInsufficientFunds = fee.plus(this.wrapGasCache).gt(res);
      }).catch((error: any) => {
        console.error('updateEvmWrapGas error:', error);
        this.wrapGasCache = undefined;
        this.wrapInsufficientFunds = false;
      });
    } catch (e) {
      console.error('updateEvmWrapGas exception:', e);
      this.wrapGasCache = undefined;
      this.wrapInsufficientFunds = false;
      return true;
    }

    return false;
  }

  updateUnwrapGas() {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) {
      this.unwrapGasCache = undefined;
      this.unwrapInsufficientFunds = false;
      return;
    }

    if (ChainHelper.isEvmChain(chain)) {
      const error = this.evmAfterGetGasPrice(chain as ChainStr,
        (price: number) => this.updateEvmUnwrapGas(price));
      if (error) {
        this.unwrapGasCache = undefined;
        this.unwrapInsufficientFunds = false;
      }
    }
  }

  updateEvmUnwrapGas(price: number): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return true;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return true;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created || !status.address) return true;
    if (!this.web3.connected(chain as ChainStr)) return true;
    const fee = this.getFee(token.chain);
    if (!fee) return true;

    const processResponse = (error: boolean, res?: number) => {
      if (error) {
        this.unwrapGasCache = undefined;
        this.unwrapInsufficientFunds = true;
      } else {
        const gas = new U256(res).mul(price);
        this.unwrapGasCache = gas;
        this.unwrapInsufficientFunds = false;
      }
    };

    if (token.type == TokenTypeStr._20) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC20Token(status.address,
          this.unwrapAmount.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            processResponse(false, res);
          }).catch((error: any) => {
            console.error('updateEvmUnwrapGas: error=', error);
            processResponse(true);
          });
      } catch (e) {
        console.error('updateEvmUnwrapGas: exception=', e);
        return true;
      }
    } else if (token.type == TokenTypeStr._721) {
      try {
        this.web3.evmCoreContract.methods.unwrapERC721Token(status.address,
          this.unwrapTokenId.to0xHex(), this.raiAccountRaw()!.to0xHex()).estimateGas({
            from: this.web3.account(), value: fee.to0xHex()
          }).then((res: number) => {
            processResponse(false, res);
          }).catch((error: any) => {
            console.error('updateEvmUnwrapGas: error=', error);
            processResponse(true);
          });
      } catch (e) {
        console.error('updateEvmUnwrapGas: exception=', e);
        return true;
      }
    } else {
      return true;
    }

    return false;
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

  unwrapSourceChainChanged(selected: string) {
    if (selected) {
      this.validator.addChain(selected as ChainStr);
      // todo: this.token.addTokenMapInfos(selected);
    }
    if (this.unwrapTokenWidget) {
      this.unwrapTokenWidget.clear();
    }
  }

  unwrapSourceChains(): string[] {
    return ChainHelper.crossChainStrs(false);
  }

  unwrapContract(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    let status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created) return '';
    return status.address!;
  }

  shortUnwrapContract(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    const chain = this.selectedWrapTargetChain;
    if (!chain) return '';
    const contract = this.unwrapContract();
    if (!contract) return '';
    const short = ChainHelper.toShortAddress(chain, contract, 5);
    return `r${token.symbol} <${short}>`;
  }

  unwrapSyncContractStatus(token: TokenItem, targetChain: string) {
    const status = this.unwrapContractStatus.get(token.chain, token.address, targetChain);
    if (!status) return;
    this.syncContractStatus(token.chain, token.address, targetChain, status, (error, status) => {
      if (status.created === true && this.unwrapTokenEq(token, targetChain)) {
        this.unwrapCheckApproved();
      }
    });
  }

  onUnwrapTokenChange() {
    this.syncUnwrapAmount();
    this.syncUnwrapTokenId();
    this.unwrapApproveStatus = ApproveStatus.NONE;

    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedWrapTargetChain;
    if (!chain) return;
    let status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status) {
      status = new WrapContractStatus();
      this.unwrapContractStatus.add(token.chain, token.address, chain, status);
    }
    this.unwrapSyncContractStatus(token, chain);
    this.startUnwrapContractStatusTimer();

    if (status.created) {
      this.unwrapCheckApproved();
    }
  }

  shortUnwrapSender(): string {
    return '';
    // todo:
  }

  unwrapAllowedToken(token: TokenItem): boolean {
    if (token.chain === this.selectedUnwrapSourceChain) {
      return false;
    }
    return true;
  }

  unwrapSelectedToken(): TokenItem | undefined {
    const widget = this.unwrapTokenWidget;
    if (!widget) return undefined;
    return widget.selectedToken;
  }

  unwrapTokenType(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';

    return token.type;
  }

  unwrapTokenFormat(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    return token.shortTextFormat();
  }

  syncUnwrapAmount() {
    if (this.inputUnwrapAmount === '') {
      this.unwrapAmountStatus = 0;
      return;
    }

    const token = this.unwrapSelectedToken();
    if (!token) {
      this.unwrapAmountStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._20) {
      this.unwrapAmountStatus = 0;
      return;
    }

    try {
      const decimalsValue = new BigNumber(10).pow(token.decimals);
      this.unwrapAmount =
        new U256(new BigNumber(this.inputUnwrapAmount).mul(decimalsValue));
      if (this.unwrapAmount.eq(0)) {
        this.unwrapAmountStatus = 2;
        return;
      }
      this.unwrapAmountStatus = 1;
    }
    catch (err) {
      this.unwrapAmountStatus = 2;
    }
  }

  syncUnwrapTokenId() {
    if (this.inputUnwrapTokenId === '') {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    const token = this.unwrapSelectedToken();
    if (!token) {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    if (token.type != TokenTypeStr._721) {
      this.unwrapTokenIdStatus = 0;
      return;
    }

    try {
      this.unwrapTokenId = new U256(this.inputUnwrapTokenId);
      this.unwrapTokenIdStatus = 1;
    }
    catch (err) {
      this.unwrapTokenIdStatus = 2;
    }
  }

  unwrapOriginalChain(): string {
    const token = this.unwrapSelectedToken();
    if (!token) return '';
    return ChainHelper.toChainShown(token.chain);
  }

  unwrapWalletConnected(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    return this.walletConnected(token.chain as ChainStr);
  }

  unwrapApprovable(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.unwrapWalletConnected()) return false;
    return this.unwrapApproveStatus == ApproveStatus.REJECTED
      || this.unwrapApproveStatus == ApproveStatus.ERROR;
  }

  unwrapApprove() {
    // todo:
    const token = this.unwrapSelectedToken();
    if (!token) return;
    if (ChainHelper.isEvmChain(token.chain)) {
      this.evmTokenApprove(token.chain, token.address, token.type as TokenTypeStr, token.symbol,
        error => {
          if (error) {
            this.unwrapApproveStatus = ApproveStatus.ERROR;
          } else {
            this.unwrapApproveStatus = ApproveStatus.CHECKING;
            this.approveCheckingSince = window.performance.now();
            this.startApproveTimer();
          }
        });
    } else {
      console.error(`Unsupported chain: ${token.chain}`);
      return;
    }
    this.unwrapApproveStatus = ApproveStatus.WAITING;
    // todo:
  }


  evmTokenApprove(chain: string, address: string, type: TokenTypeStr, symbol: string, callback: (error: boolean) => void) {
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
          callback(false);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
          callback(true);
        });
    } else if (type === TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(address);
      contract.methods.setApprovalForAll(coreAddress, true).send({
          from: this.web3.account()
        }).then((res: any) => {
          console.log('evmTokenApprove res:', res);
          callback(false);
        }).catch((error: any) => {
          console.error('evmTokenApprove error:', error);
          callback(true);
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

  unwrapable(): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    if (!this.raiAccount()) return false;
    if (!this.unwrapWalletConnected()) return false;
    if (this.unwrapApproveStatus != ApproveStatus.APPROVED) return false;
    return true;
  }

  unwrap() {
    // todo:
    const token = this.unwrapSelectedToken();
    if (!token) {
      let msg = marker(`Please select a token`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    if (token.type == TokenTypeStr._20) {
      this.syncUnwrapAmount();
      if (this.unwrapAmountStatus !== 1) {
        let msg = marker(`Please enter a valid amount`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else if (token.type == TokenTypeStr._721) {
      this.syncUnwrapTokenId();
      if (this.unwrapTokenIdStatus !== 1) {
        let msg = marker(`Please enter a valid token id`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${token.type}`);
      return;
    }

    this.activePanel = Panel.UNWRAP_CONFIRM;
    this.unwrapGasCache = undefined;
    this.unwrapInsufficientFunds = false;
    this.updateGas();
    this.startGasTimer();
    this.validator.addChain(token.chain as ChainStr);
    // todo:
  }

  unwrapShowConnectWallet(): boolean {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return !this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  unwrapShowDisconnectWallet(): boolean {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    if (ChainHelper.isEvmChain(chain)) {
      return this.walletConnected(chain as ChainStr);
    }
    return false;
  }

  async unwrapConnectWallet() {
    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    await this.connectWallet(chain as ChainStr);
    this.unwrapSyncContractStatus(token, chain);
  }

  async unwrapDisconnectWallet() {
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    await this.disconnectWallet(chain as ChainStr);
    this.unwrapApproveStatus = ApproveStatus.NONE;
  }

  unwrapTokenEq(tokenOther: TokenItem, chainOther: string): boolean {
    const token = this.unwrapSelectedToken();
    if (!token) return false;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return false;
    return token.eq(tokenOther) && chain === chainOther;
  }

  unwrapCheckApproved() {
    const token = this.unwrapSelectedToken();
    if (!token) return;
    const chain = this.selectedUnwrapSourceChain;
    if (!chain) return;
    const status = this.unwrapContractStatus.get(token.chain, token.address, chain);
    if (!status || !status.created) return;

    this.checkApproved(chain, status.address!, token.type, (status: ApproveStatus) => {
      const currentToken = this.unwrapSelectedToken();
      if (!currentToken || !token.eq(currentToken)) return;
      if (chain != this.selectedUnwrapSourceChain) return;
      const now = window.performance.now();
      if (status === ApproveStatus.APPROVED) {
        this.unwrapApproveStatus = status;
      } else if (this.approveCheckingSince === undefined || now > this.approveCheckingSince + 60000) {
        this.unwrapApproveStatus = status;
      }
      this.tryStopApproveTimer();
    });
  }

  checkApproved(chain: string, address: string, type: string, callback: (status: ApproveStatus) => void) {
    if (!this.walletConnected(chain as ChainStr)) {
      callback(ApproveStatus.NONE);
      return;
    }

    if (ChainHelper.isEvmChain(chain)) {
      this.checkEvmTokenApproved(chain, address, type, callback);
    } else {
      console.error(`Unsupported chain: ${chain}`);
      callback(ApproveStatus.ERROR);
    }
  }


  checkEvmTokenApproved(
    chain: string, address: string, type: string,
    callback: (status: ApproveStatus) => void
  ) {
    const coreAddress = Web3Service.getCoreContractAddress(chain as ChainStr);
    if (!coreAddress) {
      console.error(`No core contract address for ${chain}`);
      callback(ApproveStatus.NONE);
      return;
    }

    if (type == TokenTypeStr._20) {
      const contract = this.web3.makeErc20Contract(address);
      try {
        contract.methods.allowance(this.web3.account(),
          coreAddress).call().then((res: any) => {
            if (res !== '0') {
              callback(ApproveStatus.APPROVED);
            } else {
              callback(ApproveStatus.REJECTED);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR);
        return;
      }
    } else if (type == TokenTypeStr._721) {
      const contract = this.web3.makeErc721Contract(address);
      try {
        contract.methods.isApprovedForAll(this.web3.account(),
          coreAddress).call().then((res: boolean) => {
            if (res) {
              callback(ApproveStatus.APPROVED);
            } else {
              callback(ApproveStatus.REJECTED);
            }
          }).catch((error: any) => {
            console.error('checkEvmTokenApproved error:', error);
            callback(ApproveStatus.ERROR);
          });
      } catch (e) {
        console.error('checkEvmTokenApproved exception:', e);
        callback(ApproveStatus.ERROR);
        return;
      }
    } else {
      console.error(`Unsupported token type: ${type}`);
      callback(ApproveStatus.NONE);
    }
  }

  raiAccountRaw(): U256 | undefined {
    const account = this.raiAccount();
    if (!account) return undefined;
    const raw = new U256();
    const error = raw.fromAccountAddress(account);
    if (error) return undefined;
    return raw;
  }

}

enum Panel {
  WRAP = 'wrap',
  WRAP_CONFIRM = 'wrap_confirm',
  UNWRAP = 'unwrap',
  UNWRAP_CONFIRM = 'unwrap_confirm',
}

enum ApproveStatus {
  NONE = '',
  CHECKING = 'checking',
  WAITING = 'waiting',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  ERROR = 'error',
}

class WrapContractStatus {
  lastQuery?: number;
  created?: boolean;
  address?: string;
}

class WrapContractStatusContainer {
  private entries: {
    [originalChain: string]: {
      [originalContract: string]: {
        [targetChain: string]: WrapContractStatus
      }
    }
  } = {};

  get(chain: string, address: string, targetChain: string): WrapContractStatus {
    return this.entries[chain]?.[address]?.[targetChain];
  }

  add(chain: string, address: string, targetChain: string, status: WrapContractStatus) {
    if (!this.entries[chain]) {
      this.entries[chain] = {};
    }
    if (!this.entries[chain][address]) {
      this.entries[chain][address] = {}
    }
    this.entries[chain][address][targetChain] = status;
  }
};