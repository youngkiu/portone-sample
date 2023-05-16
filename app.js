const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const mongoose = require("mongoose");
const { User, Order} = require("./models");

const app = express();
const port = 3000;

const DATABASE_URI = 'mongodb://mongoadmin:secret@localhost:27017/payment?authSource=admin'
mongoose.connect(DATABASE_URI)
  .then(() => console.log('Successfully connected to mongodb'))
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
    res.status(400).send(e);
  }
})

app.post("/order", async (req, res) => {
  try
  {
    const { amount, user_id } = req.body;
    merchantUid = `mid_${new Date().getTime()}`;

    const order = new Order({
      _id: merchantUid,
      amount,
      user: user_id
    });
    await order.save();
    return res
      .status(200)
      .json({id: order._id});
  } catch (e) {
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
    headers: {"Content-Type": "application/json"},
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
    headers: {"Authorization": access_token}
  });
  return paymentData.data.response; // 조회한 결제 정보
}

// https://developers.portone.io/docs/ko/auth/guide/5/post
// "{서버의 결제 정보를 받는 가맹점 endpoint}" POST 요청 수신부
app.post("/payments/complete", async (req, res) => {
  console.log("/payments/complete", req.body);
  try {
    // req의 body에서 imp_uid, merchant_uid 추출
    const { imp_uid, merchant_uid } = req.body;

    // 액세스 토큰(access token) 발급 받기
    const accessToken = await getAccessToken();

    // imp_uid로 포트원 서버에서 결제 정보 조회
    const paymentData = await getPaymentData(imp_uid, accessToken) // 조회한 결제 정보
    // ...
    // DB에서 결제되어야 하는 금액 조회
    const order = await Order.findById(paymentData.merchant_uid);
    const amountToBePaid = order.amount; // 결제 되어야 하는 금액
    // ...
    // 결제 검증하기
    const { amount, status } = paymentData;
    // 결제금액 일치. 결제 된 금액 === 결제 되어야 하는 금액
    if (amount === amountToBePaid) {
      await Order.findByIdAndUpdate(merchant_uid, {$set: paymentData}); // DB에 결제 정보 저장
      // ...
      switch (status) {
        case "ready": // 가상계좌 발급
          // DB에 가상계좌 발급 정보 저장
          const { vbank_num, vbank_date, vbank_name } = paymentData;
          await User.findByIdAndUpdate(order.user._id, {
            $set: {vbank_num, vbank_date, vbank_name},
          });
          // 가상계좌 발급 안내 문자메시지 발송
          SMS.send({
            text: `가상계좌 발급이 성공되었습니다. 계좌 정보 ${vbank_num} ${vbank_date} ${vbank_name}`,
          });
          res.send({status: "vbankIssued", message: "가상계좌 발급 성공"});
          break;
        case "paid": // 결제 완료
          res.send({status: "success", message: "일반 결제 성공"});
          break;
      }
    } else {
      // 결제금액 불일치. 위/변조 된 결제
      throw {status: "forgery", message: "위조된 결제시도"};
    }
  } catch (e) {
    res.status(400).send(e);
  }
});

// https://developers.portone.io/docs/ko/result/webhook
// "/portone-webhook"에 대한 POST 요청을 처리
app.post("/portone-webhook", async (req, res) => {
  console.log("/portone-webhook", req.body);
  try {
    // req의 body에서 imp_uid, merchant_uid 추출
    const { imp_uid, merchant_uid } = req.body;

    // 액세스 토큰(access token) 발급 받기
    const accessToken = await getAccessToken();

    // imp_uid로 포트원 서버에서 결제 정보 조회
    const paymentData = await getPaymentData(imp_uid, accessToken) // 조회한 결제 정보
    // ...
    // DB에서 결제되어야 하는 금액 조회
    const order = await Order.findById(paymentData.merchant_uid);
    const amountToBePaid = order.amount; // 결제 되어야 하는 금액
    // ...
    // 결제 검증하기
    const { amount, status } = paymentData;
    // 결제금액 일치. 결제 된 금액 === 결제 되어야 하는 금액
    if (amount === amountToBePaid) {
      // DB에 결제 정보 저장
      await Order.findByIdAndUpdate(merchant_uid, {$set: paymentData});
      switch (status) {
        case "ready": // 가상계좌 발급
          // DB에 가상계좌 발급 정보 저장
          const { vbank_num, vbank_date, vbank_name } = paymentData;
          await User.findByIdAndUpdate(order.user._id, {$set: {vbank_num, vbank_date, vbank_name}});
          // 가상계좌 발급 안내 문자메시지 발송
          SMS.send({text: `가상계좌 발급이 성공되었습니다. 계좌 정보 ${vbank_num} ${vbank_date} ${vbank_name}`});
          res.send({status: "vbankIssued", message: "가상계좌 발급 성공"});
          break;
        case "paid": // 결제 완료
          res.send({status: "success", message: "일반 결제 성공"});
          break;
      }
    } else { // 결제금액 불일치. 위/변조 된 결제
      throw {status: "forgery", message: "위조된 결제시도"};
    }
  } catch (e) {
    res.status(400).send(e);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
})
