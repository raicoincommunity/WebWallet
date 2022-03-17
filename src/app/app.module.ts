import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { HashLocationStrategy, LocationStrategy } from '@angular/common';
import { ClipboardModule } from "ngx-clipboard";
import { TranslateLoader, TranslateModule, TranslateCompiler } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { TranslateMessageFormatCompiler } from 'ngx-translate-messageformat-compiler';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Web3ModalModule, Web3ModalService } from '@mindsorg/web3modal-angular';
import WalletConnectProvider from "@walletconnect/web3-provider";

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
import { BridgeBscComponent } from './components/bridge-bsc/bridge-bsc.component';
import { environment } from '../environments/environment';
import { LiquidityRewardComponent } from './components/liquidity-reward/liquidity-reward.component';
import { FaucetComponent } from './components/faucet/faucet.component';
import { AccountWidgetComponent } from './components/account-widget/account-widget.component';
import { IssueTokenComponent } from './components/issue-token/issue-token.component';
import { AssetsComponent } from './components/assets/assets.component';
import { AssetWidgetComponent } from './components/asset-widget/asset-widget.component';
import { P2pComponent } from './components/p2p/p2p.component';
import { TokenWidgetComponent } from './components/token-widget/token-widget.component'

const providerOptions = {
  walletconnect: {
    package: WalletConnectProvider, // required
    options: {
      rpc: environment.rpc_options,
      bridge: 'https://pancakeswap.bridge.walletconnect.org/',
      qrcodeModalOptions: {
        mobileLinks: [
          'Trust Wallet',
          "Metamask",
          'MathWallet',
          'SafePal',
          'TokenPocket'
        ]
      }
    },
  }
};

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
    TransactionDetailsComponent,
    BridgeBscComponent,
    LiquidityRewardComponent,
    FaucetComponent,
    AccountWidgetComponent,
    IssueTokenComponent,
    AssetsComponent,
    AssetWidgetComponent,
    P2pComponent,
    TokenWidgetComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    ReactiveFormsModule,
    FormsModule,
    ClipboardModule,
    HttpClientModule,
    Web3ModalModule,
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
    {provide: LocationStrategy, useClass: HashLocationStrategy},
    {
      provide: Web3ModalService,
      useFactory: () => {
        return new Web3ModalService({
          network: environment.bsc_network, // optional
          cacheProvider: false, // optional
          providerOptions, // required
          disableInjectedProvider: false
        });
      },
    },

  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

export function HttpLoaderFactory(httpClient: HttpClient) {
  return new TranslateHttpLoader(httpClient);
}
