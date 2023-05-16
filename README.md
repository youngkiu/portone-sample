[PortOne 개발자센터](https://developers.portone.io) (구, [PortOne Docs](https://portone.gitbook.io/docs))에서 제공하는 코드를 최대한 그대로 사용하는 방식으로 구현하였습니다.

## 실행준비

- Domain
  - `$ ./ngrok http 3000`로 Local WAS 도메인을 확보합니다. ex) https://2640-2001-4430-509d-177c-a18e-4514-fba7-2041.ngrok-free.app
  - 결제알림(Webhook)을 등록합니다. ex) https://2640-2001-4430-509d-177c-a18e-4514-fba7-2041.ngrok-free.app/portone-webhook
    - https://admin.portone.io/integration?tab=webhook
      <br><img alt="webhook.png" src="images/webhook.png" width="600"/>
  - sample.html, `m_redirect_url:`에 Webhook Endpoint URL을 적습니다.
- DB
  - Local DB 서버를 실행합니다.
    ```shell
    docker run --rm -p 27017:27017 \
      -e MONGO_INITDB_ROOT_USERNAME=mongoadmin \
      -e MONGO_INITDB_ROOT_PASSWORD=secret \
      -e MONGO_INITDB_DATABASE=payment \
      mongo
    ```
  - app.js, `DATABASE_URI = 'mongodb://mongoadmin:secret@localhost:27017/payment?authSource=admin'`
- 내 식별코드 ・ API Keys 
  - https://admin.portone.io/integration
    <br><img alt="api_keys.png" src="images/api_keys.png" width="300"/>

## 구현코드

- sample.html: https://developers.portone.io/docs/ko/auth/guide/3
  - `pg:`: https://developers.portone.io/docs/ko/tip/pg-2
  - `m_redirect_url:`: https://developers.portone.io/docs/ko/auth/guide/4/redirect
  - `impXXXXXXXX`: 가맹점 식별코드
- app.js
  - `/payments/complete`: https://developers.portone.io/docs/ko/auth/guide/5/post
  - `/portone-webhook`: https://developers.portone.io/docs/ko/result/webhook
  - `getAccessToken()`
    - `imp_key:`: REST API Key
    - `imp_secret:`: REST API Secret 

## 서버실행
  - `$ node app.js` 
    <br><img alt="server.png" src="images/server.png" width="800"/>
  - https://classic-admin.portone.io/payments
    <br><img alt="approval.png" src="images/approval.png" width="800"/>

---

만약 `.env`과 `docker-compose.yml`을 만든다면, 다음과 같이 환경변수를 설정할 수 있다.

```dotenv
MERCHANT_ID=impXXXXXXXX  # 가맹점 식별코드
IMP_APIKEY=250......     # REST API키
IMP_SECRET=tGE.........  # REST API Secret
DATABASE_URI=schema://user:pass@host:port/db
```
