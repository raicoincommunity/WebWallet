import { Injectable, OnDestroy } from '@angular/core';
import { WalletsService, WalletErrorCode } from './wallets.service';
import { TokenService } from './token.service';
import { SettingsService } from './settings.service';
import { ServerService, ServerState } from './server.service';
import { U64, U128 } from './util.service';
import { TranslateService } from '@ngx-translate/core';
import { marker } from '@biesbjerg/ngx-translate-extract-marker';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class AutoReceiveService implements OnDestroy {
  private timerAutoReceive: any = null;
  private notfified: {[account: string]: boolean} = {};

  constructor(
    private settings: SettingsService,
    private server: ServerService,
    private wallets: WalletsService,
    private translate: TranslateService,
    private notification: NotificationService,
    private token: TokenService
  ) {
    this.timerAutoReceive = setInterval(() => this.autoReceive(), 1000);
  }

  ngOnDestroy() {
    if (this.timerAutoReceive) {
      clearInterval(this.timerAutoReceive);
      this.timerAutoReceive = null;
    }
  }

  autoReceive() {
    let setting = this.settings.getAutoReceive();
    if (!setting.enable) return;
    if (this.server.getState() !== ServerState.CONNECTED) return;
    
    this.wallets.wallets.forEach(w => {
      if (w.locked()) return;
      w.accounts.forEach (a => {
        let check = this.wallets.accountActionCheck(a, w);
        if (check !== WalletErrorCode.SUCCESS) return;

        let received = false;
        let tokenReceived = false;
        while (true) {
          if (this.wallets.limited(a)) break;
          if (this.wallets.restricted(a)) break;

          const receivables = this.wallets.receivables(a);
          if (receivables.length !== 0) {
            const r = receivables[0];
            if (r.amount.lt(setting.minimum)) break;
            if (!a.created()) {
              const timestamp = this.server.getTimestamp();
              if (r.amount.lt(this.wallets.creditPrice(new U64(timestamp)))) break;
            }
            const result = this.wallets.receive(r.hash.toHex(), a, w);
            if (result.errorCode !== WalletErrorCode.SUCCESS) break;
            received = true;  
          } else {
            const tokenReceivables = this.token.receivables(a.address());
            if (tokenReceivables.length === 0) break;
            const r = tokenReceivables[0];
            if (!a.created()) {
              this.notify(a.address());
              break;
            }
            const result = this.token.receive(a.address(), r.key(), a, w);
            if (result.errorCode !== WalletErrorCode.SUCCESS) break;
            tokenReceived = true;
          }
        }

        if (received) {
          this.wallets.receivablesQuery(a);
        }
        if (tokenReceived) {
          this.token.receivablesQuery(a.address());
        }

      });
    })
  }

  notify(account: string) {
    if (this.notfified[account]) return;

    let timestamp = this.server.getTimestamp();
    const price = this.wallets.creditPrice(new U64(timestamp));
    
    const shortAccount = account.substr(0, 8) + '...' + account.substr(60, 4);
    let msg = marker(`Failed to receive token, please deposit at least {amount} RAI to activate the account first: {account}`);
    const param = { 'amount': price.toBalanceStr(U128.RAI()), account: shortAccount};
    this.translate.get(msg, param).subscribe(res => msg = res);    
    this.notification.sendWarning(msg, { timeout: 20 * 1000 });

    this.notfified[account] = true;
  }

}
