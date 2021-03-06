# Web wallet for Raicoin
___

# Live version
You can access the wallet from any device at [https://raiwallet.org/](https://raiwallet.org/)


# Bugs/Feedback
If you run into any issues, please use the [GitHub Issue Tracker](https://github.com/raicoincommunity/WebWallet/issues) or head over to our [Telegram Group](https://t.me/RaicoinOfficial)!  

# Development Prerequisites
1. Install NPM https://www.npmjs.com/get-npm
2. Install Angular CLI: npm install -g @angular/cli

# Development Guide
1. Clone repository and install dependencies
```
git clone https://github.com/raicoincommunity/WebWallet
cd WebWallet
npm install
```

2. Run the wallet in development mode
```
npm run wallet:dev
```

3. Build wallet for release
```
npm run wallet:build
```

# Acknowledgements
Special thanks to the following!
- [dcposch/blakejs](https://github.com/dcposch/blakejs) - Blake2b Implementation
- [dchest/tweetnacl-js](https://github.com/dchest/tweetnacl-js) - Cryptography Implementation
- [cronoh/nanovault](https://github.com/cronoh/nanovault) - UI template
