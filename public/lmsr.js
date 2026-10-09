// Logarithmic Market Scoring Rule (Hanson) — the automated market maker
// Polymarket originally priced its markets with. Shared by server and browser.
//
//   cost(q)   = b * ln( sum_j exp(q_j / b) )
//   price_i   = exp(q_i / b) / sum_j exp(q_j / b)        (prices always sum to 1)
//
// q_j is the number of outstanding shares of outcome j, b is the liquidity:
// a larger b means prices move less per point spent. A share of the winning
// outcome pays out 1 point when the market resolves.
(function (root) {
  function logSumExp(q, b) {
    const m = Math.max(...q.map((x) => x / b));
    return m + Math.log(q.reduce((s, x) => s + Math.exp(x / b - m), 0));
  }

  function cost(q, b) {
    return b * logSumExp(q, b);
  }

  function prices(q, b) {
    const m = Math.max(...q) / b;
    const e = q.map((x) => Math.exp(x / b - m));
    const s = e.reduce((a, c) => a + c, 0);
    return e.map((x) => x / s);
  }

  // Shares of outcome i received for spending `amount` points (closed form).
  function sharesForAmount(q, b, i, amount) {
    const p = prices(q, b)[i];
    return b * Math.log(1 + (Math.exp(amount / b) - 1) / p);
  }

  // Points received for selling `shares` of outcome i back to the market.
  function sellProceeds(q, b, i, shares) {
    const after = q.slice();
    after[i] -= shares;
    return cost(q, b) - cost(after, b);
  }

  // Everything a trade ticket needs to show before the user confirms.
  function quote(q, b, i, side, value) {
    const after = q.slice();
    let shares, points;
    if (side === 'buy') {
      points = value;
      shares = sharesForAmount(q, b, i, value);
      after[i] += shares;
    } else {
      shares = value;
      points = sellProceeds(q, b, i, value);
      after[i] -= shares;
    }
    return {
      shares,
      points,
      avgPrice: shares > 0 ? points / shares : 0,
      priceBefore: prices(q, b)[i],
      priceAfter: prices(after, b)[i],
      payout: side === 'buy' ? shares : 0,
    };
  }

  const api = { cost, prices, sharesForAmount, sellProceeds, quote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LMSR = api;
})(this);
