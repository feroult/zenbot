var BlinkTradeAPI = require('blinktrade'),
  path = require('path'),
  minimist = require('minimist'),
  // eslint-disable-next-line no-unused-vars
  colors = require('colors'),
  n = require('numbro')

const PROD = true
const FOXBIT_ID = '4'

module.exports = function foxbit (conf) {
  var s = {
    options: minimist(process.argv)
  }
  var so = s.options

  var public_client, authed_client

  function publicClient() {
    if (!public_client) public_client = new BlinkTradeAPI.BlinkTradeRest({
      prod: PROD,
      key: conf.foxbit.key,
      secret: conf.foxbit.secret,
      currency: 'BRL'
    })
    return public_client
  }

  function authedClient() {
    if (!authed_client) {
      if (!conf.foxbit || !conf.foxbit.key || !conf.foxbit.key === 'YOUR-API-KEY') {
        throw new Error('please configure your foxbit credentials in ' + path.resolve(__dirname, 'conf.js'))
      }

      authed_client = new BlinkTradeAPI.BlinkTradeRest({
        prod: true,
        key: conf.foxbit.key,
        secret: conf.foxbit.secret,
        currency: 'BRL'
      })
    }
    return authed_client
  }

  function joinProduct(product_id) {
    return (product_id.split('-')[0].toLowerCase() + product_id.split('-')[1]).toLowerCase()
  }

  function retry(method, args, error) {
    console.log('retry', method, args, error)
    if (error.code === 429) {
      console.error((`\nfoxbit API rate limit exceeded! unable to call ${method}, aborting`).red)
      return
    }

    if (method !== 'getTrades') {
      console.error((`\nfoxbit API is down: (${method}) ${error.message}`).red)
      console.log(('Retrying in 30 sseconds ...').yellow)
    }

    debugOut(error)

    setTimeout(function() {
      exchange[method].apply(exchange, args)
    }, 30000)

  }

  function debugOut(msg) {
    if (so.debug) console.log(msg)
  }

  var orders = {}

  var exchange = {
    name: 'foxbit',
    historyScan: 'forward',
    makerFee: 0.25,
    takerFee: 0.50,

    getProducts: function() {
      return require('./products.json')
    },

    getTrades: function(opts, cb) {
      var func_args = [].slice.call(arguments)
      var args = {
        limit: 100,
        // since: opts.from
      }

      if(opts.from > 999999999) {
        if(PROD) {
          // args.since = 2500000 // Mon Feb 05 2018 10:07:22 GMT-0200 (-02)
          // args.since=2620000
          args.since=1600000
        } else {
          args.since = 18000 // Mon Jan 22 2018 15:15:05 GMT-0200 (test)
        }
      } else {
        args.since = opts.from
      }

      var client = publicClient()
      client.trades(args)
        .then(body => {
          // console.log('body', body)
          var trades = body.map(function(trade) {
            return {
              trade_id: trade.tid,
              time: trade.date * 1000,
              size: Number(trade.amount),
              price: Number(trade.price),
              side: trade.side
            }
          })

          cb(null, trades)
        })
        .catch(error => retry('getTrades', func_args, error))
    },

    getBalance: function(opts, cb) {
      var func_args = [].slice.call(arguments)

      var client = authedClient()
      client.balance()
        .then(result => {
          var wallet = result[FOXBIT_ID]

          let VALUE_BASE = 100000000

          const balance = {
            asset: n(wallet.BTC).divide(VALUE_BASE).format('0.00000'),
            asset_hold: n(wallet.BTC_locked).divide(VALUE_BASE).format('0.00000'),
            currency: n(wallet.BRL).divide(VALUE_BASE).format('0.00'),
            currency_hold: n(wallet.BRL_locked).divide(VALUE_BASE).format('0.00')
          }
          cb(null, balance)
        })
        .catch(error => retry('getBalance', func_args, error))
    },

    getQuote: function(opts, cb) {
      var func_args = [].slice.call(arguments)

      var client = publicClient()
      client.ticker()
        .then(body => {
          var r = {
            bid: String(body.buy),
            ask: String(body.sell)
          }
          cb(null, r)
        })
        .catch(error => retry('getQuote', func_args, error))
    },

    cancelOrder: function(opts, cb) {
      var order = orders['~' + opts.order_id]

      var func_args = [].slice.call(arguments)
      var params = {
        orderID: opts.order_id,
        ClOrdID: order.ClOrdID
      }

      debugOut(`Cancelling order ${opts.order_id}`)

      var client = authedClient()
      client.cancelOrder(params)
        .then(cb())
        .catch(error => retry('cancelOrder', func_args, error))
    },

    buy: function(opts, cb) {
      var params = {
        side: '1',
        price: parseInt((opts.price * 1e8).toFixed(0)),
        amount: parseInt((opts.size * 1e8).toFixed(0)),
        symbol: joinProduct(opts.product_id).toUpperCase()
      }

      debugOut(`Requesting ${opts.order_type} buy for ${opts.size} assets`)

      console.log('params', params)

      var client = authedClient()
      client.newOrder(params)
        .then(body => {
          var order = {
            id: body.OrderID,
            status: 'open',
            price: Number(opts.price),
            size: Number(opts.size),
            created_at: new Date().getTime(),
            filled_size: '0',
            ordertype: opts.order_type,
            postonly: !!opts.post_only,
            ClOrdID: body.ClOrdID
          }

          debugOut(`    Purchase ID: ${body.id}`)

          orders['~' + body.order_id] = order
          cb(null, order)
        })
        .catch(error => cb(error))
    },

    sell: function(opts, cb) {
      var params = {
        side: '2',
        price: parseInt((opts.price * 1e8).toFixed(0)),
        amount: parseInt((opts.size * 1e8).toFixed(0)),
        symbol: joinProduct(opts.product_id).toUpperCase()
      }

      debugOut(`Requesting ${opts.order_type} sell for ${opts.size} assets`)

      console.log('params', params)

      var client = authedClient()
      client.newOrder(params)
        .then(body => {
          var order = {
            id: body.OrderID,
            status: 'open',
            price: Number(opts.price),
            size: Number(opts.size),
            created_at: new Date().getTime(),
            filled_size: '0',
            ordertype: opts.order_type,
            postonly: !!opts.post_only,
            ClOrdID: body.ClOrdID
          }

          debugOut(`    Purchase ID: ${body.id}`)

          orders['~' + body.order_id] = order
          cb(null, order)
        })
        .catch(error => cb(error))
    },

    getOrder: function(opts, cb) {
      var order = orders['~' + opts.order_id]
      var params = {
        order_id: opts.order_id
      }

      var client = authedClient()
      client.getMyOrderStatus(params)
        .then(body => {
          if (typeof body !== 'undefined') {
            if (body.is_cancelled) {
              order.status = 'done'
              order.done_at = new Date().getTime()
              order.filled_size = '0.00000'
            } else if (!body.is_live) {
              order.status = 'done'
              order.done_at = new Date().getTime()
              order.filled_size = n(body.executed_amount).format('0.00000')
              order.price = n(body.avg_execution_price).format('0.00')
            } else {
              order.filled_size = n(body.executed_amount).format('0.00000')
              order.price = n(body.avg_execution_price).format('0.00')
            }
          }

          debugOut(`Lookup order ${opts.order_id} status is ${order.status}`)

          cb(null, order)
        })
        .catch(error => cb(error))
    },

    // return the property used for range querying.
    getCursor: function(trade) {
      return (trade.trade_id || trade)
    }
  }
  return exchange
}
