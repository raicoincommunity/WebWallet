import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { WelcomeComponent } from './components/welcome/welcome.component';
import { ConfigureWalletComponent } from './components/configure-wallet/configure-wallet.component';
import { WalletsComponent } from './components/wallets/wallets.component';
import { AccountsComponent } from './components/accounts/accounts.component';
import { ReceiveComponent } from './components/receive/receive.component';
import { AccountDetailsComponent } from './components/account-details/account-details.component';
import { SendComponent } from './components/send/send.component';
import { AccountSettingsComponent } from './components/account-settings/account-settings.component';
import { WalletSettingsComponent } from './components/wallet-settings/wallet-settings.component';
import { GlobalSettingsComponent } from './components/global-settings/global-settings.component';
import { TransactionDetailsComponent } from './components/transaction-details/transaction-details.component';
import { BridgeBscComponent } from './components/bridge-bsc/bridge-bsc.component';

const routes: Routes = [
  { path: '', component: WelcomeComponent },
  { path: 'account/:address', component: AccountDetailsComponent },
  { path: 'accounts', component: AccountsComponent },
  { path: 'bridge-bsc', component: BridgeBscComponent},
  { path: 'configure-wallet', component: ConfigureWalletComponent },
  { path: 'send', component: SendComponent },
  { path: 'wallets', component: WalletsComponent },
  { path: 'receive', component: ReceiveComponent },
  { path: 'account-settings', component: AccountSettingsComponent },
  { path: 'wallet-settings', component: WalletSettingsComponent },
  { path: 'global-settings', component: GlobalSettingsComponent },
  { path: 'transaction/:hash', component: TransactionDetailsComponent },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    anchorScrolling: 'enabled',
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
