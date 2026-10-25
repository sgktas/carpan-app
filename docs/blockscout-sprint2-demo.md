# Carpan Blockscout Sprint 2 payment review walkthrough

Edited captured-screen walkthrough; not a continuous live session. Microsoft Zira offline synthetic English narration. Original captures show 25 October live research and 24-25 October authenticated local acceptance using real mainnet data. Private acceptance uses a separate local database; no production business data is copied. No new payment was performed for this video.

## One operator. One USDC payment.

Carpan helps a business operator turn USDC payment evidence into a reviewed record. Start in Finance with one wallet, one network, and one payment. This walkthrough uses the existing point one USDC mainnet pilot between the builder's own wallets. It is not customer revenue. No new payment is made for this demo. Public research now supports Arc, Base, Arbitrum, and Ethereum. Other chains are research only; private accounting review remains on Arc.

## Blockscout context inside Finance

Finance reads eligible Circle USDC transfers through Blockscout. A separate action loads counterparty labels and token metadata. This actual local acceptance capture uses the same real mainnet payment. The provider returned USDC metadata but no public label for the recipient, so Carpan shows unknown instead of inventing an identity. Source, timestamp, and cache information stay visible. Every request is bounded; the result is not complete wallet history.

## Who paid whom?

The Finance link preserves the network, wallet, and transaction in Terminal. Analyze USDC events groups payment relationships for that wallet. Here, point one USDC went to the same recipient. Gas and transfers to the same address do not inflate incoming or outgoing totals. Token events establish the movement, but they cannot establish business purpose or ownership. The operator must review that business context.

## Real payment. Explicit business review.

In the authenticated isolated workspace, we registered the verified wallet and imported the real payment by transaction hash. Arc receipt and canonical block checks confirmed the payment. The native system event and six decimal token mirror were linked as one movement, not two payments. We classified it as an internal transfer and saved a reference explicitly identifying an owner operated pilot. Only then did we approve the record. Gas was kept separate, at zero point zero zero one nine two zero five nine five USDC.

## Reviewed output, not an ERP posting

The approved record was exported as one immutable JSON package. We parsed the downloaded file and checked the payment hash, exact amount, matched mirror, and approved internal transfer decision. Ready for posting remains false, and accounting status remains not submitted. The commercial API is still closed. This screen shows the saved real record and export history after reopening the workspace. These are edited screenshots from live research and isolated local acceptance, not a continuous live recording. The focused flow is discover, verify, review, approve, and export.