const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD,
  },
});

const sendMail = async (email, resetCode) => {
  const mailOptions = {
    from: process.env.SMTP_USERNAME,
    to: email,
    subject: "Reset your Password",
    html: `<b>Your Reset Code is ${resetCode}</b>`,
  };

  const result = await transporter.sendMail(mailOptions);

  return result;
};

module.exports = sendMail;
