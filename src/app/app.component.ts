import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from './services/wallets.service';
import { NotificationService } from './services/notification.service';
import { U128 } from './services/util.service';
import { SettingsService } from './services/settings.service';
import { ServerState, ServerService } from './services/server.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { AliasService } from './services/alias.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {

  inactiveSeconds: number = 0;
  windowHeight:number = 1000;
  state: ServerState = ServerState.DISCONNECTED;
  addressToggle: boolean = true;

  @HostListener('window:resize', ['$event']) onResize (e: any) {
    this.windowHeight = e.target.innerHeight;
  };

  private timer: any = null;

  constructor(
    private translate: TranslateService,
    private wallets: WalletsService, 
    private settings: SettingsService,
    private server: ServerService,
    private alias: AliasService,
    private notification: NotificationService){
  }

  ngOnInit() {
    this.windowHeight = window.innerHeight;
    this.state = this.server.getState();

    this.server.state$.subscribe(s => this.state = s);

    this.timer = setInterval(() => {
      this.inactiveSeconds += 5;
      if (!this.settings.getLockMinutes()) return; // Do not lock on inactivity

      let seconds = this.settings.getLockMinutes() * 60;
      if (seconds === 0) return;
      if (this.inactiveSeconds >= seconds) {
        let errorCode = this.wallets.lockAll();
        if (errorCode === WalletErrorCode.SUCCESS) {

          let msg = marker('Wallets locked after { lockMinutes } minutes of inactivity');
          const param = { 'lockMinutes': this.settings.getLockMinutes() };
          this.translate.get(msg, param).subscribe(res => msg = res);
          this.notification.sendInfo(msg);
        }
        this.inactiveSeconds = 0;
      }
    }, 5000);
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  updateIdleTime() {
    this.inactiveSeconds = 0; // Action has happened, reset the inactivity timer
  }

  configured(): boolean {
    return this.wallets.configured();
  }

  copied() {
    if (this.showAlias()) {
      let msg = marker('Account alias copied to clipboard!');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);  
    } else {
      let msg = marker('Account address copied to clipboard!');
      this.translate.get(msg).subscribe(res => msg = res);
      this.notification.sendSuccess(msg);  
    }
  }

  walletIndex(): number {
    return this.wallets.selectedWalletIndex();
  }

  selectedAccountAddress(): string {
    return this.wallets.selectedAccountAddress();
  }

  balance(): Amount {
    let account = this.wallets.selectedAccount();
    if (!account) return { negative: false, value: new U128(0) };
    return account.balance();
  }

  pending(): Amount {
    let account = this.wallets.selectedAccount();
    if (!account) return { negative: false, value: new U128(0) };
    return account.pending();
  }

  receivable(): Amount {
    let account = this.wallets.selectedAccount();
    if (!account) return { negative: false, value: new U128(0) };
    return account.receivable();
  }

  connected(): boolean {
    return this.state === ServerState.CONNECTED;
  }

  connecting(): boolean {
    return this.state === ServerState.CONNECTING;
  }

  disconnected(): boolean {
    return this.state === ServerState.DISCONNECTED;
  }

  lang(): string {
    return this.translate.currentLang;
  }

  changeLang(lang: string) {
    this.settings.setLang(lang);
  }

  synchronizing(): boolean {
    return this.wallets.synchronizing();
  }

  hasAlias(): boolean {
    return !!this.alias.alias(this.wallets.selectedAccountAddress());
  }

  showAlias(): boolean {
    if (!this.hasAlias()) return false;
    return this.addressToggle;
  }

  toggleAddress() {
    this.addressToggle = !this.addressToggle;
  }

  getAlias(): string {
    return this.alias.alias(this.wallets.selectedAccountAddress());
  }

  copyAccountOrAlias(): string {
    if (this.showAlias()) {
      return this.getAlias();
    } else {
      return this.selectedAccountAddress();
    }
  }

}
