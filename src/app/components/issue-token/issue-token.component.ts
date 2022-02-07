import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U8, UtilService, U256, ExtensionTypeStr, ExtensionTokenOp, ExtensionTokenOpStr, TokenType } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-issue-token',
  templateUrl: './issue-token.component.html',
  styleUrls: ['./issue-token.component.css']
})
export class IssueTokenComponent implements OnInit {
  public selectedTokenType = 'RAI-20';
  public inputTokenName = '';
  public inputTokenSymbol = '';
  public inputDecimals = '';
  public inputInitSupply = '';
  public inputCapSupply = '';
  public inputMintable = true;
  public inputBurnable = true;
  public inputCirculable = true;
  public inputBaseUri = '';
  public activePanel = '';

  public tokenNameStatus = 0;
  public tokenSymbolStatus = 0;

  private decimals = new U8(18);
  private initSupply = new U256(0);
  private capSupply = new U256(0);

  @ViewChild('elemTokenName') elemTokenName : ElementRef | null = null;
  @ViewChild('elemTokenSymbol') elemTokenSymbol : ElementRef | null = null;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService,
    private token: TokenService,
    private notification: NotificationService) {

  }

  ngOnInit(): void {
    this.token.addAccount(this.selectedAccountAddress());
    this.token.issuer$.subscribe(x => {
      if (x.account !== this.selectedAccountAddress()) return;
      if (x.created) {
        if (this.activePanel === ActivePanel.CREATE) {
          this.activePanel = ActivePanel.DEFUALT;
        }
      } else {
        this.activePanel = ActivePanel.CREATE
      }
    });
    if (this.token.issuerQueried(this.selectedAccountAddress())) {
      if (!this.token.issued(this.selectedAccountAddress())) {
        this.activePanel = ActivePanel.CREATE;
      }
    }
  }

  toggleInputMintable() {
    this.inputMintable = !this.inputMintable;
  }

  toggleInputBurnable() {
    this.inputBurnable = !this.inputBurnable;
  }

  toggleInputCirculable() {
    this.inputCirculable = !this.inputCirculable;
  }

  checkTokenName() {
    this.tokenNameStatus = this.inputTokenName === '' ? 1 : 0;
  }

  checkTokenSymbol() {
    this.tokenSymbolStatus = this.inputTokenSymbol === '' ? 1 : 0;
  }

  syncDecimals(): boolean {
    try {
      if (this.inputDecimals === '') {
        this.decimals = new U8(18);
        return false;
      }
      this.decimals = new U8(new BigNumber(this.inputDecimals));
      return false;
    }
    catch (err) {
      return true;
    }
  }

  syncInitSupply(): boolean {
    try {
      if (this.inputInitSupply === '' || this.inputInitSupply === '0') {
        this.initSupply = new U256(0);
        return false;
      }
  
      const decimalsValue = new BigNumber(10).pow(this.decimals.toNumber());
      this.initSupply =
        new U256(new BigNumber(this.inputInitSupply).mul(decimalsValue));
      return false;
    }
    catch (err) {
      return true;
    }
  }

  syncCapSupply(): boolean {
    try {
      if (this.inputCapSupply === '' || this.inputCapSupply === '0') {
        this.capSupply = new U256(0);
        return false;
      }
  
      if (this.selectedTokenType === 'RAI-20') {
        const decimalsValue = new BigNumber(10).pow(this.decimals.toNumber());
        this.capSupply =
          new U256(new BigNumber(this.inputCapSupply).mul(decimalsValue));
        if (!this.capSupply.eq(0)) {
          if (this.capSupply.lt(this.initSupply)) {
            return true;
          }
        }
      } else if (this.selectedTokenType === 'RAI-721') {
        this.capSupply = new U256(new BigNumber(this.inputCapSupply));
      } else {
        return true;
      }
      return false;
    }
    catch (err) {
      return true;
    }
  }

  getDecimals(): string {
    return this.decimals.toDec();
  }

  getInitSupply(): string {
    if (this.selectedTokenType === 'RAI-20') {
      return this.initSupply.toBalanceStr(this.decimals) + ' ' + this.inputTokenSymbol;
    } else if (this.selectedTokenType === 'RAI-721') {
      return '0 ' + this.inputTokenSymbol;
    } else {
      return '';
    }
  }

  getCapSupply(): string {
    if (this.capSupply.toBigNumber().eq(0))
    {
      let msg = marker(`Unlimited`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    if (this.selectedTokenType === 'RAI-20') {
      return this.capSupply.toBalanceStr(this.decimals) + ' ' + this.inputTokenSymbol;
    } else if (this.selectedTokenType === 'RAI-721') {
      return this.capSupply.toBalanceStr(new U8(0)) + ' ' + this.inputTokenSymbol;
    } else {
      return '';
    }
  }

  getMintable(): string {
    if (this.selectedTokenType === 'RAI-721')
    {
      return this.boolToString(true);
    }
    return this.boolToString(this.inputMintable);
  }

  getBurnable(): string {
    return this.boolToString(this.inputBurnable);
  }

  getCirculable(): string {
    return this.boolToString(this.inputCirculable);
  }

  create() {
    this.inputTokenName = this.inputTokenName.trim();
    if (this.inputTokenName === '') {
      this.tokenNameStatus = 1;
      if (this.elemTokenName) {
        this.elemTokenName.nativeElement.focus();
      }
      return;
    }

    this.inputTokenSymbol = this.inputTokenSymbol.trim();
    if (this.inputTokenSymbol === '') {
      this.tokenSymbolStatus = 1;
      if (this.elemTokenSymbol) {
        this.elemTokenSymbol.nativeElement.focus();
      }
      return;
    }

    this.inputDecimals = this.inputDecimals.trim();
    this.inputInitSupply = this.inputInitSupply.trim();
    this.inputCapSupply = this.inputCapSupply.trim();
    this.inputBaseUri = this.inputBaseUri.trim();

    if (this.selectedTokenType === 'RAI-20') {
      if (this.syncDecimals()) return;
      if (this.syncInitSupply()) return;
    }
    if (this.syncCapSupply()) return;

    if (this.selectedTokenType === 'RAI-20') {
      if (!this.inputMintable && this.initSupply.eq(0)) {
        let msg = marker(`Please input a non-zero initial supply or enable mintable option`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
      if (!this.capSupply.eq(0) && this.capSupply.lt(this.initSupply)) {
        let msg = marker(`The cap supply can not be less than initial supply`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    } else if (this.selectedTokenType === 'RAI-721') {
      // pass
    } else {
      return;
    }

    const wallet = this.wallets.selectedWallet()
    if (!wallet) {
      let msg = marker(`Please configure a wallet first`);
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    } else {
      if (wallet.locked()) {
        this.wallets.tryInputPassword();
        let msg = marker(`Please unlock your wallet and retry again`);
        this.translate.get(msg).subscribe(res => msg = res);
        this.notification.sendError(msg);
        return;
      }
    }

    this.activePanel = ActivePanel.CONFIRM_CREATION;
  }

  confirmCreation() {
    let value = {};
    if (this.selectedTokenType === 'RAI-20') {
      value = {
        op: ExtensionTokenOpStr.CREATE,
        type: '20',
        name: this.inputTokenName,
        symbol: this.inputTokenSymbol,
        init_supply: this.initSupply.toDec(),
        cap_supply: this.capSupply.toDec(),
        decimals: this.decimals.toDec(),
        burnable: this.inputBurnable ? 'true' : 'false',
        mintable: this.inputMintable ? 'true' : 'false',
        circulable: this.inputCirculable ? 'true' : 'false'
      };
    } else if (this.selectedTokenType === 'RAI-721') {
      value = {
        op: ExtensionTokenOpStr.CREATE,
        type: '721',
        name: this.inputTokenName,
        symbol: this.inputTokenSymbol,
        base_uri: this.inputBaseUri,
        cap_supply: this.capSupply.toDec(),
        burnable: this.inputBurnable ? 'true' : 'false',
        circulable: this.inputCirculable ? 'true' : 'false'
      }
    } else {
      console.log(`confirmCreation:Unknown type=${this.selectedTokenType}`);
      return;
    }

    const extensions = [ { type: ExtensionTypeStr.TOKEN, value } ];
    const result = this.wallets.changeExtensions(extensions);
    if (result.errorCode !== WalletErrorCode.SUCCESS) {
      let msg = result.errorCode;
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendError(msg);
      return;
    }

    let msg = marker(`Successfully sent token creation block!`);
    this.translate.get(msg).subscribe(res => msg = res);    
    this.notification.sendSuccess(msg);

    this.activePanel = ActivePanel.DEFUALT;
    this.inputTokenName = '';
    this.inputTokenSymbol = '';
    this.inputDecimals = '';
    this.inputInitSupply = '';
    this.inputCapSupply = '';
    this.inputMintable = true;
    this.inputBurnable = true;
    this.inputCirculable = true;
    this.inputBaseUri = '';
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  issued(): boolean {
    if (!this.selectedAccountAddress()) return false;
    if (!this.token.issuerQueried(this.selectedAccountAddress())) return false;
    return this.token.issued(this.selectedAccountAddress());
  }

  name(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.name;
  }

  symbol(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.symbol;
  }

  address(): string {
    return this.selectedAccountAddress();
  }

  copied() {
    let msg = marker(`Token address copied to clipboard!`);
    this.translate.get(msg).subscribe(res => msg = res);
    this.notification.sendSuccess(msg);
  }

  type(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.type === TokenType._20) {
      return 'RAI-20'
    } else if (info.type === TokenType._721) {
      return 'RAI-721';
    } else {
      return 'Unknown type';
    }
  }

  showDecimals(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.decimals.toDec();
  }

  totalSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.totalSupply.toBalanceStr(info.decimals) + ' ' + info.symbol;
  }

  showCapSupply(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    if (info.capSupply.eq(0))
    {
      let msg = marker(`Unlimited`);
      this.translate.get(msg).subscribe(res => msg = res);
      return msg;
    }

    return info.capSupply.toBalanceStr(info.decimals) + ' ' + info.symbol;
  }

  mintable(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.mintable);
  }

  burnable(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.burnable);
  }

  circulable(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return this.boolToString(info.circulable);
  }

  holders(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.holders.toFormat();
  }

  transfers(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.transfers.toFormat();
  }

  swaps(): string {
    const info = this.token.tokenInfo(this.address());
    if (!info) return '';
    return info.swaps.toFormat();
  }

  private boolToString(bool: boolean): string {
    let msg = bool ? marker(`Yes`) : marker(`No`);
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

}

enum ActivePanel {
  DEFUALT = '',
  CREATE = 'create',
  CONFIRM_CREATION = 'confirm_creation',
}