import { Injectable, OnInit, OnDestroy } from '@angular/core';
import { Subject} from 'rxjs';
import { TokenService, SwapProcessResult, SwapReturnCode } from './token.service';
import { SettingsService } from './settings.service';
import { ServerService, ServerState } from './server.service';
import { TranslateService } from '@ngx-translate/core';
import { NotificationService } from './notification.service';
import { UtilService } from './util.service';
import { WalletsService, WalletErrorCode } from './wallets.service';

@Injectable({
  providedIn: 'root'
})
export class AutoSwapService implements OnInit, OnDestroy {
  private timerAutoSwap: any = null;
  private notifies: {[account: string]: number} = {};

  constructor(
    private settings: SettingsService,
    private server: ServerService,
    private translate: TranslateService,
    private notification: NotificationService,
    private token: TokenService,
    private util: UtilService,
    private wallets: WalletsService
  ) {
    this.timerAutoSwap = setInterval(() => this.autoSwap(), 1000);
  }

  ngOnInit() {
  }

  ngOnDestroy() {
    if (this.timerAutoSwap) {
      clearInterval(this.timerAutoSwap);
      this.timerAutoSwap = null;
    }
  }

  autoSwap() {
    if (this.server.getState() !== ServerState.CONNECTED) return;

    for (let w of this.wallets.wallets) {
      if (w.locked()) continue;
      for (let a of w.accounts) {
        const swap = this.settings.getAutoSwap(a.address());
        if (swap === false) continue;
        let check = this.wallets.accountActionCheck(a, w);
        if (check !== WalletErrorCode.SUCCESS) continue;

        let result = this.token.processActiveSwaps(a, w);
        if (result.returnCode === SwapReturnCode.SUCCESS
          || result.returnCode === SwapReturnCode.WAITING) {
          continue;
        } else if (result.returnCode === SwapReturnCode.FAILED) {
          this.notify(a.address(), result);
        } else if (result.returnCode === SwapReturnCode.SKIPPED) {
          result = this.token.processPings(a, w);
          if (result.returnCode === SwapReturnCode.FAILED) {
            this.notify(a.address(), result);
          }
        } else {
          // do nothing
        }
      }
    }
  }

  notify(account: string, result: SwapProcessResult) {
    if (result.returnCode !== SwapReturnCode.FAILED) return;
    if (!result.walletOpResult
      || result.walletOpResult.errorCode === WalletErrorCode.SUCCESS) return;

    const errorCode = result.walletOpResult.errorCode;
    if (errorCode === WalletErrorCode.CREDIT
      || errorCode === WalletErrorCode.CREDIT_FOR_ORDER
      || errorCode === WalletErrorCode.CREDIT_RESERVED_FOR_SWAP) {
      if (result.mainAccountError) {
        account = result.mainAccount || '';
      }
      const lastNotify = this.notifies[account];
      if (lastNotify && lastNotify + 30 >= this.server.getTimestamp()) return;

      const shortAccount = this.util.other.shortAddress(account, 4);
      let msg = errorCode;
      this.translate.get(msg).subscribe(res => msg = res);    
      this.notification.sendWarning(`${msg} (${shortAccount})`, { timeout: 30 * 1000 });
  
      this.notifies[account] = this.server.getTimestamp();
    }
  }

}
