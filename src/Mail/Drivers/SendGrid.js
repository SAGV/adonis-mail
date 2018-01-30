'use strict'

const fs = require('fs')
const got = require('got')
const nodemailer = require('nodemailer')

class SendGridTransporter {

  constructor (config) {
    this.config = config
  }

  /**
   * Transport name
   *
   * @attribute name
   *
   * @return {String}
   */
  get name () {
    return 'sendgrid'
  }

  /**
   * Transport version
   *
   * @attribute version
   *
   * @return {String}
   */
  get version () {
    return '1.0.0'
  }

  /**
   * The sendgrid endpoint
   *
   * @attribute endpoint
   *
   * @return {String}
   */
  get endpoint () {
    return 'https://api.sendgrid.com/v3/mail/send'
  }

  /**
   * The auth header value to be sent along
   * as header
   *
   * @attribute authHeader
   *
   * @return {String}
   */
  get authHeader () {
    return `Bearer ${this.config.apiKey}`
  }


  /**
   * Takes a MIME formatted name/email pair and returns
   * a javascript object for the data.
   *
   * @method addressToSendgridAddress
   *
   * @return {Object} contact
   *
   * @private
   */
  _addressToSendgridAddress (contact, toField) {

    // To fields are supposed to be wrapped into double quotes if they consist forbidded symbols. It doesn't harm to always wrap those.
    // See https://stackoverflow.com/questions/15555563/how-to-format-an-email-from-header-that-contains-a-comma
    if (toField) {
      return { name: `"${contact.name.replace('"', "\"")}"`, email: contact.address }
    }

    return { name: contact.name, email: contact.address }
  }

  /**
   * Sends email using sengrid v3 API
   *
   * @method send
   *
   * @param  {Object}   mail
   * @param  {Function} callback
   *
   * @public
   */
  send (mail, callback) {
    // Base64 encode each attachment
    const attachments = []
    const readPromises = []
    if (mail.data.attachments) {
      mail.data.attachments.forEach((attachment) => {
        const path = attachment.path
        const filename = path.split('/').pop()
        readPromises.push(
          new Promise((resolve, reject) => {
            fs.readFile(path, {
              encoding: 'base64'
            }, (err, data) => {
              if (err) return reject(err)
              const content = data
              attachments.push({ filename, content })
              return resolve(data)
            })
          })
        )
      })
    }

    Promise.all(readPromises).then(() => {
      const body = {
        personalizations: [],
        content: []
      }

      // Add attachments if there are any
      if (attachments.length > 0) {
        body.attachments = attachments
      }

      console.log(mail.data)

      // Add from object
      body.from = this._addressToSendgridAddress(mail.data.from[0])

      // Add all recipient obejcts
      const toObjects = mail.data.to.map(contact => this._addressToSendgridAddress(contact, true))

      // Add to recipients to body with subject
      body.personalizations.push({
        subject: mail.data.subject,
        to: toObjects
      })

      // add plain content
      if (mail.data.text) {
        body.content.push({
          type: 'text/plain',
          value: mail.data.text
        })
      }

      // add html content
      if (mail.data.html) {
        body.content.push({
          type: 'text/html',
          value: mail.data.html
        })
      }

      // Send request to api
      got.post(this.endpoint, {
        body: body,
        json: true,
        headers: {
          'user-agent': 'adonis-mail',
          'Authorization': this.authHeader,
          'Content-Type': 'application/json'
        }
      })
      .then((response) => {
        const messageId = (mail.message.getHeader('message-id') || '').replace(/[<>\s]/g, '')
        callback(null, { messageId })
      })
      .catch((error) => {
        try {
          callback(JSON.parse(error.response.body), {})
        } catch (e) {
          callback(error, {})
        }
      })
    }).catch((error) => {
      return callback(error, {})
    })
  }
}

class SendGrid {

  /**
   * This method is called by mail manager automatically
   * and passes the config object
   *
   * @method setConfig
   *
   * @param  {Object}  config
   */
  setConfig (config) {
    this.transporter = nodemailer.createTransport(new SendGridTransporter(config))
  }

  /**
   * Send a message via message object
   *
   * @method send
   * @async
   *
   * @param  {Object} message
   *
   * @return {Object}
   *
   * @throws {Error} If promise rejects
   */
  send (message) {
    return new Promise((resolve, reject) => {
      this.transporter.sendMail(message, (error, result) => {
        if (error) {
          reject(error)
        } else {
          resolve(result)
        }
      })
    })
  }

}

module.exports = SendGrid
module.exports.Transport = SendGridTransporter
