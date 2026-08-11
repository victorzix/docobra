# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## 1.0.0 (2026-08-11)

### Features

* add auth middleware protecting /dashboard ([748c00b](https://github.com/victorzix/docobra/commit/748c00b5959b665b6b9b4fdb828894b99ced34b2))
* add login page ([02233fb](https://github.com/victorzix/docobra/commit/02233fbaee4533600d5af11e0b707aa298a5f78c))
* add login route handler ([b257fb8](https://github.com/victorzix/docobra/commit/b257fb8788b4fcdbde0de423115689a66fbc6826))
* add logout route handler ([818274b](https://github.com/victorzix/docobra/commit/818274bd9a78587135f5fd9e782b15d798f52d2a))
* add minimal protected dashboard page ([9c33a57](https://github.com/victorzix/docobra/commit/9c33a576d28f5623049db9ca5ec29c987f4e3b64))
* add nome column to usuario ([9423d3d](https://github.com/victorzix/docobra/commit/9423d3dbfc711753d4b8284f0958d2d42cda70ce))
* add pure resolveSessionAction for middleware ([4f6bdc5](https://github.com/victorzix/docobra/commit/4f6bdc5463e91d5b2fa25cea360867e77162477b))
* add react query mutation hooks for auth ([a1521cf](https://github.com/victorzix/docobra/commit/a1521cf1d5fd260a99215e8ed448f0db5fc74d1b))
* add register and login zod schemas ([ed58eb5](https://github.com/victorzix/docobra/commit/ed58eb517b3ac01ed6c9cce6bd74db8c4f36e9c3))
* add register page ([774e93c](https://github.com/victorzix/docobra/commit/774e93c13845cad6e58032f55aad95d65554debe))
* add register route handler ([ba185b7](https://github.com/victorzix/docobra/commit/ba185b73511d438cb30e216359da086cf637a9e2))
* add resolverOrdem to configure LLM fallback order via env var ([4201373](https://github.com/victorzix/docobra/commit/4201373ed729ccf5708cb38326f7b590476df4f6))
* add session constants and getSessionUser ([efc1389](https://github.com/victorzix/docobra/commit/efc13898abad1c59b3b43bd73d0dd35ded2ebe1f))
* validate LLMRouter request before trying providers ([f0d61bd](https://github.com/victorzix/docobra/commit/f0d61bd0caffb6d9fd8e7482d0209b0cbb5d0cc8))
* wire memorialRouter/comuniqueSeRouter to configurable fallback order ([4ecbccd](https://github.com/victorzix/docobra/commit/4ecbccd298d32fc10a10f0b8497d29a3359189fb))
* wire up react query provider ([b64e621](https://github.com/victorzix/docobra/commit/b64e621a154c2c2e0da981a4b2bf4021e0bf8659))

### Bug Fixes

* disable vitest fileParallelism to avoid shared-DB test races ([2d575bf](https://github.com/victorzix/docobra/commit/2d575bfb86431ac5a4b91bee2530aa88fc936283))
* guard test setup against targeting the wrong database ([e2d0311](https://github.com/victorzix/docobra/commit/e2d0311e6e5912405eb4ae619acc8323d1e02a1a))
* mark session cookie secure in production and dedupe cookie options ([016775a](https://github.com/victorzix/docobra/commit/016775a695d8bdb66eebf59c286594c3737aa6f7))
* move middleware.ts into src/ so Next.js actually loads it ([00e4cb0](https://github.com/victorzix/docobra/commit/00e4cb052571e0be03bdcb0ed6329b6a0713a589))
* normalize email casing on register and login ([315d5cb](https://github.com/victorzix/docobra/commit/315d5cb1b9d4e2486a51156397fab26e3c04ee43))
* remove artificial delay from resolveSessionAction ([b25b871](https://github.com/victorzix/docobra/commit/b25b8718ae3745fc1067a24a3364829df7ce8da4))
* satisfy generic LLMProvider.extractStructured signature in test fakes ([2757cd1](https://github.com/victorzix/docobra/commit/2757cd1f7253d67cb00422401137a702e79506d8))
* validate from param to prevent open redirect on login ([d81bd41](https://github.com/victorzix/docobra/commit/d81bd413caf828ef6652381bccb7062c939bbff4))
* wrap login form in suspense boundary for static prerendering ([bd6b6cb](https://github.com/victorzix/docobra/commit/bd6b6cbdb9d8cd41d27236f65f000e08fff5bca4))

### Documentation

* add auth design spec ([e6f50aa](https://github.com/victorzix/docobra/commit/e6f50aaa12b75c706219ae878c50b3151a9f0041))
* add auth implementation plan ([0046cdb](https://github.com/victorzix/docobra/commit/0046cdb468ebcf15a33a2c70160711d5ef631a27))
* add LLM layer gap-closing design spec ([63a8680](https://github.com/victorzix/docobra/commit/63a86803a29edc7c500f9913966f1b4638f00818))
* add LLM layer gap-closing implementation plan ([8697d1f](https://github.com/victorzix/docobra/commit/8697d1faf2c9acf52fcec09493040bd1a98c8a51))
* fix invalid jose time unit in auth plan (1ms -> 1s) ([a753a54](https://github.com/victorzix/docobra/commit/a753a54417194a8ee59320dfc1e0d9ec60643082))
* warn that removing gemini from LLM_ORDER_MEMORIAL disables voice memorials ([8f166f0](https://github.com/victorzix/docobra/commit/8f166f0ce1e11fddec4f8f2a436f4008ce771fe5))
