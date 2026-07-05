# FC.OS - KPI Formulas Specification
## Mathematical Formulations for Collector Performance

---

### 1. Rasio Kontak Sukses (Visit Success Rate)
$$Visit\ Success\ Rate = \left( \frac{Visits_{Successful}}{Visits_{Total}} \right) \times 100\%$$
- *Visits Successful*: Count of visits matching status `'CONTACT'` or results like `'CUSTOMER_MET'`, `'PAID'`, `'PARTIAL_PAYMENT'`, or `'PROMISE_TO_PAY'`.

---

### 2. Rasio Komitmen Janji Bayar (Commitment Success Rate)
$$Commitment\ Success\ Rate = \left( \frac{PTP_{Completed}}{PTP_{Completed} + PTP_{Broken}} \right) \times 100\%$$
- *PTP Completed*: Promises with status `'Completed'` where the customer successfully deposited the minimum payment.
- *PTP Broken*: Promises marked `'Broken'` or `'Overdue'`.

---

### 3. Persentase Pemulihan Target (Recovery Rate)
$$Recovery\ Rate = \left( \frac{Recovery\ Amount}{Target\ Amount} \right) \times 100\%$$
- *Recovery Amount*: Sum of collected deposit payments within the filtered time frame.
- *Target Amount*: Assigned quota for the collector, or total regional target.

---

### 4. Skor Produktivitas Koleksi (Weighted Collection Productivity Score)
$$Collection\ Productivity\ Score = (Success_{Visit} \times 0.3) + (Success_{Commitment} \times 0.3) + (Math.min(100, Rate_{Recovery}) \times 0.4)$$
- **Weights Alignment**:
  - **30%**: Visit success rate (Kinerja aktivitas lapangan)
  - **30%**: Commitment fulfillment rate (Kualitas negosiasi janji bayar)
  - **40%**: Hard target recovery percentage (Kontribusi finansial langsung)
- **Capping**: Capped at maximum of `100` to prevent outlier distortions.
