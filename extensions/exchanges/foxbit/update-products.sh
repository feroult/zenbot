#!/usr/bin/env node
const ccxt = require ('ccxt')
const c = require('../../../conf')
const n = require('numbro')

const foxbit = new ccxt.foxbit({
  'apiKey': c.foxbit.key,
  'secret': c.foxbit.secret,
})


var hardcodedOptions = {
    BTC: {
        min_size: '0.002',
        max_size: '30',
        step: 0.001
    }
};

foxbit.fetch_markets()
  .then(result =>   {
    var products = []

    for (var key in result) {
        if (!result.hasOwnProperty(key)) {
            continue;
        }
        var product = result[key]
        products.push({
            asset: product.base,
            currency: product.quote,
            min_size: hardcodedOptions[product.base].min_size,
            max_size: hardcodedOptions[product.base].max_size,
            increment: n(hardcodedOptions[product.base].step).format('0.000000000000000000'),
            label: product.symbol
        })
    }
    var target = require('path').resolve(__dirname, 'products.json')
    require('fs').writeFileSync(target, JSON.stringify(products, null, 2))
    console.log('wrote', target)
    process.exit()
  })
  .catch(function (error) {
    console.error('An error occurred', error)
    process.exit(1)
  })
