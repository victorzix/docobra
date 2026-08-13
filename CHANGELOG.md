# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.1.0](https://github.com/victorzix/docobra/compare/v1.0.0...v1.1.0) (2026-08-13)

### Features

* add buscarNomesUsuarioEEmpresa query ([9572283](https://github.com/victorzix/docobra/commit/957228375fb5e4bf6147fcd68dbee66df5cc7bfe))
* add dashboard sidebar nav using shadcn Sidebar ([df39cbe](https://github.com/victorzix/docobra/commit/df39cbe187df2b3691e856aa7dafc7922124856f))
* add dashboard user menu with logout ([3d16dca](https://github.com/victorzix/docobra/commit/3d16dcade4d65913e0f3891c42c598b39b5b5db6))
* add POST /api/projetos route handler ([730943e](https://github.com/victorzix/docobra/commit/730943eae09aeb933f9f876fb89a06d7e4fe0904))
* add projeto query layer (criar, listar) ([bf575ee](https://github.com/victorzix/docobra/commit/bf575ee57290d35e656373f086025598696cf5d8))
* add projetos page with create dialog and nav item ([cf74bf1](https://github.com/victorzix/docobra/commit/cf74bf12a81105a6e17f2c72d55ccc64e1bd5ccb))
* build authenticated dashboard shell with sidebar and module placeholders ([151198f](https://github.com/victorzix/docobra/commit/151198f0b250386a6fc6d75056c5f1231ae9b6d9))

### Bug Fixes

* **dashboard:** remove nested main landmark and persist sidebar state ([ed410de](https://github.com/victorzix/docobra/commit/ed410de6dcddab81639a876672d16cb89f36f3cb))
* use useSyncExternalStore in useIsMobile to avoid hydration mismatch ([9013d43](https://github.com/victorzix/docobra/commit/9013d43393dfcae26c587d220deb29cc1aad1984))

### Documentation

* add dashboard shell design spec ([47ea85e](https://github.com/victorzix/docobra/commit/47ea85e854bc001e3b65128ccccbdebcb6733627))
* add dashboard shell implementation plan ([30aa965](https://github.com/victorzix/docobra/commit/30aa96539bc88255df99a0a986e0b63ad805cfc9))
* add Projeto CRUD design spec ([4f78193](https://github.com/victorzix/docobra/commit/4f781937f2def263a1584695dd28760a06968c67))
* add Projeto CRUD implementation plan ([e7a5c49](https://github.com/victorzix/docobra/commit/e7a5c490372e68ac511be6367aa47f399e914a4b))

### Refactoring

* rename middleware.ts to proxy.ts per Next.js 16 convention ([1dac2ae](https://github.com/victorzix/docobra/commit/1dac2ae65f0d6fd30b3140d270dedb374121cbdd))
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
