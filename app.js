const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mongoose = require("mongoose");
const { User, Card, Order } = require("./models");

const app = express();
const port = 3000;

const DATABASE_URI = "mongodb://mongoadmin:secret@localhost:27017/payment?authSource=admin"
mongoose.connect(DATABASE_URI)
  .then(() => console.log("Successfully connected to mongodb"))
  .catch(e => console.error(e));

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/sample.html")
})

app.post("/user", async (req, res) => {
  try
  {
    const user = new User();
    await user.save();
    return res
      .status(200)
      .json({ id: user._id });
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
})

app.post("/order", async (req, res) => {
  try
  {
    const { amount, user_id } = req.body;

    const order = new Order({
      _id: `mid_${Date.now()}`,
      amount,
      user: user_id,
    });
    await order.save();

    return res
      .status(200)
      .json({
        merchant_uid: order._id,
      });
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
})

app.post("/card", async (req, res) => {
  try
  {
    const { pg, period, user_id } = req.body;

    const card = new Card({
      _id: `cid_${Date.now()}`,
      pg,
      period,
      user: user_id,
    });
    await card.save();

    return res
      .status(200)
      .json({
        customer_uid: card._id,
      });
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
})

async function getAccessToken() {
  // https://portone.gitbook.io/docs/etc/phone/4.
  const getToken = await axios({
    url: "https://api.iamport.kr/users/getToken",
    // POST method
    method: "post",
    // "Content-Type": "application/json"
    headers: { "Content-Type": "application/json" },
    data: {
      imp_key: "250......", // REST API키
      imp_secret: "tGE........." // REST API Secret
    }
  });
  const { access_token } = getToken.data.response; // 인증 토큰
  return access_token;
}

async function getPaymentData(imp_uid, access_token) {
  // https://portone.gitbook.io/docs/auth/guide/5/post
  const paymentData = await axios({
    // imp_uid 전달
    url: `https://api.iamport.kr/payments/${imp_uid}`,
    // GET method
    method: "get",
    // 인증 토큰 Authorization header에 추가
    headers: { "Authorization": access_token }
  });
  console.log( paymentData.config.url, { ...paymentData.data });
  return paymentData.data; // 조회한 결제 정보
}

// https://developers.portone.io/docs/ko/api/billing-key-api/get-billing-key-api
async function getBillingKey(customer_uid, access_token) {
  const billingKeyResult = await axios({
    url: `https://api.iamport.kr/subscribe/customers/${customer_uid}`,
    method: "get",
    // 인증 토큰을 Authorization header에 추가
    headers: { 'Authorization': access_token }
  });
  console.log( billingKeyResult.config.url, { ...billingKeyResult.data });
  return billingKeyResult.data;
}

async function requestPayment(customer_uid, access_token, user_id, currency) {
  const card = await Card.findById(customer_uid);

  const amount = 8900;
  const order = new Order({
    _id: `mid_${Date.now()}`,
    amount,
    card: card._id,
    user: user_id,
  });
  await order.save();

  const paymentResult = await axios({
    url: `https://api.iamport.kr/subscribe/payments/again`,
    method: 'post',
    // 인증 토큰을 Authorization header에 추가
    headers: { "Authorization": access_token },
    data: {
      customer_uid,
      merchant_uid: order._id, // 새로 생성한 결제(재결제)용 주문 번호
      currency, // 페이팔은 KRW 불가능
      amount,
      name: "월간 이용권 정기결제"
    }
  });
  console.log( paymentResult.config.url, { ...paymentResult.data });
  return paymentResult.data;
}

// https://developers.portone.io/docs/ko/auth/guide-1/undefined#step-01-%EA%B2%B0%EC%A0%9C-%EC%98%88%EC%95%BD%ED%95%98%EA%B8%B0
async function reservePayment(customer_uid, access_token, user_id) {
  const card = await Card.findById(customer_uid);

  const amount = 8900;
  const order = new Order({
    _id: `mid_${Date.now()}`,
    amount,
    card: card._id,
    user: user_id,
  });
  await order.save();

  const paymentResult = await axios({
    url: `https://api.iamport.kr/subscribe/payments/schedule`,
    method: "post",
    headers: { "Authorization": access_token },
    data: {
      customer_uid,
      schedules: [
        {
          merchant_uid: order._id, // 주문 번호
          schedule_at: Math.round(Date.now() / 1000) + card.period, // 결제 시도 시각 in Unix Time Stamp. 예: 다음 달 1일
          amount,
          name: "월간 이용권 정기결제",
          buyer_name: "홍길동",
          buyer_tel: "01012345678",
          buyer_email: "gildong@gmail.com"
        }
      ],
    }
  });
  console.log(paymentResult.config.url, { ...paymentResult.data });
  return paymentResult.data;
}

// https://developers.portone.io/docs/ko/result/webhook
// https://developers.portone.io/docs/ko/auth/guide-1/undefined#step-02-%EA%B2%B0%EC%A0%9C-%EA%B2%B0%EA%B3%BC-%EC%88%98%EC%8B%A0%EB%B0%9B%EA%B8%B0
// "/portone-webhook"에 대한 POST 요청을 처리
app.post("/portone-webhook", async (req, res) => {
  console.log(req.url, req.body);
  try {
    // req의 body에서 imp_uid, merchant_uid 추출
    const { imp_uid, merchant_uid } = req.body;

    // 액세스 토큰(access token) 발급 받기
    const accessToken = await getAccessToken();

    // imp_uid로 포트원 서버에서 결제 정보 조회
    const { code, message, response: paymentData } = await getPaymentData(imp_uid, accessToken) // 조회한 결제 정보
    // ...
    // DB에서 결제되어야 하는 금액 조회
    const order = await Order.findById(paymentData.merchant_uid);
    if (!order) {
      console.error(`Not found merchant_uid: ${paymentData.merchant_uid}`);
      res.end();
      return;
    }
    const amountToBePaid = order.amount; // 결제 되어야 하는 금액
    // ...
    // 결제 검증하기
    const { amount, status } = paymentData;
    // 결제금액 일치. 결제 된 금액 === 결제 되어야 하는 금액
    if (amount === amountToBePaid) {
      // DB에 결제 정보 저장
      await Order.findByIdAndUpdate(merchant_uid, { $set: paymentData });
      switch (status) {
        case "ready": // 가상계좌 발급
          // DB에 가상계좌 발급 정보 저장
          const { vbank_num, vbank_date, vbank_name } = paymentData;
          await User.findByIdAndUpdate(order.user._id, { $set: { vbank_num, vbank_date, vbank_name } });
          // 가상계좌 발급 안내 문자메시지 발송
          SMS.send({ text: `가상계좌 발급이 성공되었습니다. 계좌 정보 ${vbank_num} ${vbank_date} ${vbank_name}` });
          res.send({ status: "vbankIssued", message: "가상계좌 발급 성공" });
          break;
        case "paid": // 결제 완료
          res.send({ status: "success", message: "일반 결제 성공" });
          break;
        case "cancelled":
          await Order.findByIdAndUpdate(order._id, { status });
          res.send({ status, message: "결제 취소" });
          break;
        default:
          console.error({ status });
          throw { status, message: "unknown status" };
      }
    } else { // 결제금액 불일치. 위/변조 된 결제
      throw { status: "forgery", message: "위조된 결제시도" };
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

// https://developers.portone.io/docs/ko/auth/guide/5/post
// "{서버의 결제 정보를 받는 가맹점 endpoint}" POST 요청 수신부
app.post("/payments/complete", async (req, res) => {
  console.log(req.url, req.body);
  try {
    // req의 body에서 imp_uid, merchant_uid 추출
    const { imp_uid, merchant_uid } = req.body;

    // 액세스 토큰(access token) 발급 받기
    const accessToken = await getAccessToken();

    // imp_uid로 포트원 서버에서 결제 정보 조회
    const { code, message, response: paymentData } = await getPaymentData(imp_uid, accessToken) // 조회한 결제 정보
    // ...
    // DB에서 결제되어야 하는 금액 조회
    const order = await Order.findById(paymentData.merchant_uid);
    const amountToBePaid = order.amount; // 결제 되어야 하는 금액
    // ...
    // 결제 검증하기
    const { amount, status } = paymentData;
    // 결제금액 일치. 결제 된 금액 === 결제 되어야 하는 금액
    if (amount === amountToBePaid) {
      await Order.findByIdAndUpdate(merchant_uid, { $set: paymentData }); // DB에 결제 정보 저장
      // ...
      switch (status) {
        case "ready": // 가상계좌 발급
          // DB에 가상계좌 발급 정보 저장
          const { vbank_num, vbank_date, vbank_name } = paymentData;
          await User.findByIdAndUpdate(order.user._id, {
            $set: { vbank_num, vbank_date, vbank_name },
          });
          // 가상계좌 발급 안내 문자메시지 발송
          SMS.send({
            text: `가상계좌 발급이 성공되었습니다. 계좌 정보 ${vbank_num} ${vbank_date} ${vbank_name}`,
          });
          res.send({ status: "vbankIssued", message: "가상계좌 발급 성공" });
          break;
        case "paid": // 결제 완료
          res.send({ status: "success", message: "일반 결제 성공" });
          break;
        default:
          throw { status, message: "unknown status" };
      }
    } else {
      // 결제금액 불일치. 위/변조 된 결제
      throw { status: "forgery", message: "위조된 결제시도" };
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

// https://developers.portone.io/docs/ko/auth/guide-1/bill/pg
app.post("/billings/complete", async (req, res) => {
  console.log(req.url, req.body);
  try {
    // req의 body에서 customer_uid 추출
    const { customer_uid, paid_at, status } = req.body;

    // 액세스 토큰(access token) 발급 받기
    const accessToken = await getAccessToken();

    // customer_uid로 포트원 서버에서 결제 정보 조회
    const { code, message, response: billingKeyData } = await getBillingKey(customer_uid, accessToken);

    // 빌링키 검증하기
    // DB에서 customer_uid 조회
    const card = await Card.findById(customer_uid);
    if (card) {
      await Card.findByIdAndUpdate(card._id, {
        paid_at,
        status,
      });
    } else { // 위/변조 된 결제
      throw { status: "forgery", message: "위조된 결제시도" };
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

// https://developers.portone.io/docs/ko/auth/guide-1/bill/pg#step-03-%EA%B2%B0%EC%A0%9C-%EC%9A%94%EC%B2%AD%ED%95%98%EA%B8%B0
app.post("/billings", async (req, res) => {
  console.log(req.url, req.body);
  try {
    const { user_id, customer_uid, currency } = req.body; // req의 body에서 customer_uid 추출

    // 인증 토큰 발급 받기
    const accessToken = await getAccessToken();
    // ...
    // 결제(재결제) 요청
    const { code, message, response: paymentResult } = await requestPayment(customer_uid, accessToken, user_id, currency);
    // ...
    if (code === 0) { // 카드사 통신에 성공(실제 승인 성공 여부는 추가 판단이 필요함)
      if ( paymentResult.status === "paid" ) { // 카드 정상 승인
        res.send({ status: "success", message: "비승인 결제 성공" });
      } else { //카드 승인 실패 (예: 고객 카드 한도초과, 거래정지카드, 잔액부족 등)
        // status : failed 로 수신됨
        res.send({ status: paymentResult.status, message: "비승인 결제 실패"});
      }
    } else { // 카드사 요청에 실패 (paymentResult is null)
      res.send({ status: message, message: "비승인 요청 실패" });
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

// https://developers.portone.io/docs/ko/auth/guide-1/undefined
app.post("/payments/schedule", async (req, res) => {
  console.log(req.url, req.body);
  try {
    const { user_id, customer_uid } = req.body; // req의 body에서 customer_uid 추출

    // 인증 토큰 발급 받기
    const accessToken = await getAccessToken();
    // ...
    // 결제 예약 요청
    const { code, message, response: [ paymentResult ] } = await reservePayment(customer_uid, accessToken, user_id);
    // ...
    if (code === 0) { // 카드사 통신에 성공(실제 승인 성공 여부는 추가 판단이 필요함)
      if ( paymentResult.schedule_status === "scheduled" ) { // 카드 정상 승인
        res.send({ status: "success", message: "결제 예약 성공" });
      } else { // 카드 승인 실패 (예: 고객 카드 한도초과, 거래정지카드, 잔액부족 등)
        // status : failed 로 수신됨
        res.send({ status: paymentResult.schedule_status, message: "결제 예약 실패"});
      }
    } else { // 카드사 요청에 실패 (paymentResult is null)
      res.send({ status: message, message: "예약 요청 실패" });
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

app.get("/billings", async (req, res) => {
  try {
    const { pg } = req.query;

    const card = await Card.findOne({ pg, status: 'paid' }).sort({ paid_at: -1 });
    if (card) {
      return res
        .status(200)
        .json({
          user_id: card.user._id,
          customer_uid: card._id,
        });
    } else { // 위/변조 된 결제
      throw { status: "null", message: "빌링키가 없습니다." };
    }
  } catch (e) {
    console.error(e.message);
    res.status(400).send(e);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})
