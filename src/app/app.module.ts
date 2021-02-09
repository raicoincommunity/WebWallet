import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ClipboardModule } from "ngx-clipboard";
import { TranslateLoader, TranslateModule, TranslateCompiler } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { TranslateMessageFormatCompiler } from 'ngx-translate-messageformat-compiler';
import { HttpClient, HttpClientModule } from '@angular/common/http';


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
import { TransactionDetailsComponent } from './components/transaction-details/transaction-details.component';

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
    GlobalSettingsComponent,
    TransactionDetailsComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    ClipboardModule,
    HttpClientModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      },
      compiler: {
        provide: TranslateCompiler,
        useClass: TranslateMessageFormatCompiler
      }
    }),
  ],
  providers: [
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

export function HttpLoaderFactory(httpClient: HttpClient) {
  return new TranslateHttpLoader(httpClient);
}
