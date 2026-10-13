# Security and trust boundaries

Report reproducible issues privately to **info@carpan.app**. Do not include private keys, cookies, provider credentials or personal customer data. No bounty commitment is implied.

- The browser wallet retains its private keys and presents transaction signatures to the user. Wallet connection and account authentication are separate.
- Authentication uses one-use signed challenges and HttpOnly sessions. Public payment links expose payment coordinates, not private customer/invoice fields.
- A successful chain receipt proves a movement, not ownership of an institution or the purpose of a payment. The collection owner reviews the invoice relationship.
- Arc native USDC and ERC-20 USDC are two views of one balance. Mirrored events are not two receipts; transaction gas is separate.
- Recovery checkpoints are not settlement evidence. They preserve the original transfer; unknown outcomes must be checked before sending again.
- Mainnet involves real USDC. Automated verification does not sign transactions, create production accounts, submit grant applications or exercise administrative privileges.
- RPC/explorer dependencies can be unavailable or incomplete. Source availability and bounded coverage are shown rather than fabricated values.
- Backups on one server are not offsite protection. Production needs a separate backup destination and notification channel.

The repository pattern check is a publication safeguard, not a complete security audit. Review the export before publishing. License selection and dependency/asset attribution should be reviewed by the owner before public release.
