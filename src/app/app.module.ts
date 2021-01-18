import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ClipboardModule } from "ngx-clipboard";

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { ConfigureWalletComponent } from './components/configure-wallet/configure-wallet.component';
import { NotificationComponent } from './components/notification/notification.component';
import { WalletsComponent } from './components/wallets/wallets.component';
import { ShortAccountPipe } from './pipes/short-account.pipe';
import { AccountsComponent } from './components/accounts/accounts.component';
import { WalletWidgetComponent } from './components/wallet-widget/wallet-widget.component';
import { BalancePipe } from './pipes/balance.pipe';
import { ReceiveComponent } from './components/receive/receive.component';
import { AccountDetailsComponent } from './components/account-details/account-details.component';
import { SendComponent } from './components/send/send.component';
import { AccountSettingsComponent } from './components/account-settings/account-settings.component';
import { WalletSettingsComponent } from './components/wallet-settings/wallet-settings.component';
import { GlobalSettingsComponent } from './components/global-settings/global-settings.component';

@NgModule({
  declarations: [
    AppComponent,
    WelcomeComponent,
    ConfigureWalletComponent,
    NotificationComponent,
    WalletsComponent,
    ShortAccountPipe,
    AccountsComponent,
    WalletWidgetComponent,
    BalancePipe,
    ReceiveComponent,
    AccountDetailsComponent,
    SendComponent,
    AccountSettingsComponent,
    WalletSettingsComponent,
    GlobalSettingsComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    ClipboardModule
  ],
  providers: [
    {provide: LocationStrategy, useClass: HashLocationStrategy}
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
