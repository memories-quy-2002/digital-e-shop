# Shipping implementation boundary

Delivery quotes snapshot whole VND pricing and a conservative stacked-parcel
estimate. Missing parcel metadata blocks a quote. Existing orders keep null
snapshots and their stored amounts. Product dimensions are operator-owned.

GHN fee/service endpoints still require legacy district identifiers; a province
and ward alone must not silently produce zero delivery fees. Sandbox results are
local simulations. Real account/staging validation remains a separate gate.
