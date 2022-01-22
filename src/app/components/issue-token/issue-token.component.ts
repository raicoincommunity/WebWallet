import { Component, OnInit, ViewChild, ElementRef, } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from '../../services/wallets.service';
import { NotificationService } from '../../services/notification.service';
import { U8, UtilService, U256 } from '../../services/util.service';
import { BigNumber } from 'bignumber.js';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';

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
  public activePanel = 'create';

  public tokenNameStatus = 0;
  public tokenSymbolStatus = 0;

  private decimals = new U8(18);
  private initSupply = new U256(0);
  private capSupply = new U256(0);

  @ViewChild('elemTokenName') elemTokenName : ElementRef | null = null;
  @ViewChild('elemTokenSymbol') elemTokenSymbol : ElementRef | null = null;

  constructor(
    private translate: TranslateService,
    private notification: NotificationService) {

  }

  ngOnInit(): void {
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
      let msg = marker(`Unlimit`);
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
    if (this.inputTokenName === '') {
      this.tokenNameStatus = 1;
      if (this.elemTokenName) {
        this.elemTokenName.nativeElement.focus();
      }
      return;
    }
    if (this.inputTokenSymbol === '') {
      this.tokenSymbolStatus = 1;
      if (this.elemTokenSymbol) {
        this.elemTokenSymbol.nativeElement.focus();
      }
      return;
    }
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

    this.activePanel = 'confirmCreation';
  }

  confirmCreation() {
    // todo:
  }

  private boolToString(bool: boolean): string {
    let msg = bool ? marker(`Yes`) : marker(`No`);
    this.translate.get(msg).subscribe(res => msg = res);
    return msg;
  }

}
