import { Component, HostListener, OnInit } from '@angular/core';
import { WalletsService, Amount, WalletErrorCode } from './services/wallets.service';
import { NotificationService } from './services/notification.service';
import { U128 } from './services/util.service';
import { SettingsService } from './services/settings.service';
import { ServerState, ServerService } from './services/server.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  inactiveSeconds: number = 0;
  windowHeight:number = 1000;
  state: ServerState = ServerState.DISCONNECTED;

  @HostListener('window:resize', ['$event']) onResize (e: any) {
    this.windowHeight = e.target.innerHeight;
  };

  constructor(
    private wallets: WalletsService, 
    private settings: SettingsService,
    private server: ServerService,
    private notification: NotificationService){

  }

  ngOnInit() {
    this.windowHeight = window.innerHeight;
    this.state = this.server.getState();

    this.server.state$.subscribe(s => this.state = s);

    setInterval(() => {
      this.inactiveSeconds += 5;
      if (!this.settings.getLockMinutes()) return; // Do not lock on inactivity

      let seconds = this.settings.getLockMinutes() * 60;
      if (seconds === 0) return;
      if (this.inactiveSeconds >= seconds) {
        let errorCode = this.wallets.lockAll();
        if (errorCode === WalletErrorCode.SUCCESS) {
          this.notification.sendSuccess(`Wallets locked after ${this.settings.getLockMinutes()} minutes of inactivity`);
        }
        this.inactiveSeconds = 0;
      }
    }, 5000);
  }

  updateIdleTime() {
    this.inactiveSeconds = 0; // Action has happened, reset the inactivity timer
  }

  configured(): boolean {
    return this.wallets.configured();
  }

  copied() {
    this.notification.sendSuccess(`Account address copied to clipboard!`);
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

}
