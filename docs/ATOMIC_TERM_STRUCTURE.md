# Atomic Term Structure & Russell–Saunders Coupling (`ATOMS v0.7.1`)

## 1. Scientific Scope & Domain

`src/physics/ls/terms.ts` implements exact **nonrelativistic Russell–Saunders ($LS$) term enumeration**, parity determination, seniority ($v$) classification, and allowed total angular momentum $J \in [|L-S|, L+S]$ listing (unsplit in v0.7.1) for arbitrary multi-shell electronic configurations $\{n_1 \ell_1^{q_1}, n_2 \ell_2^{q_2}, \dots, n_k \ell_k^{q_k}\}$ supporting $s, p, d, f, g, h$ shells.

- **Explicit Parity Rule:** $\Pi = (-1)^{\sum_i q_i \ell_i}$ (`"even"` for $+1$, `"odd"` for $-1$, denoted by `°` on odd terms such as `⁴S°`, `²P°`, `²D°`).
- **Distinction from Hartree–Fock (`v0.7.0`):** Pure single-determinant HF (`RHF`, `UHF`, `ROHF`) and fractional `AtomSphAverageRHF` ensembles in `v0.7.0` do **not** isolate correlated $L^2$ multiplet states (`termSymbol = null`, `lSquared = null`). In `v0.7.1`, `AtomicTermsWorkspace` + `lsTermCiProvider` resolves true $(L^2, S^2, \Pi)$ eigenstates within fixed $SO(3)$ HF orbitals.

---

## 2. Exact Equivalent-Electron Decomposition ($n\ell^q$)

For an equivalent subshell $\ell^q$ ($0 \le q \le 2(2\ell+1)$), `enumerateEquivalentSubshellTerms(l, q)` constructs the exact antisymmetric Slater-determinant $(M_L, M_S)$ weight lattice by enumerating all $\binom{4\ell+2}{q}$ Pauli-allowed single-shell microstates and peeling off highest-weight $(L, S)$ rectangles recursively:

1. **Guaranteed Exactness & Microstate Sum Rule:**
   $$\sum_{\text{terms } (L,S)} \text{count}(L,S) \cdot (2L+1)(2S+1) = \binom{4\ell+2}{q}$$
   For example:
   - $p^2$ ($\binom{6}{2} = 15$): $^{3}P + {}^{1}D + {}^{1}S$ ($9 + 5 + 1 = 15$, even parity)
   - $p^3$ ($\binom{6}{3} = 20$): $^{4}S^\circ + {}^{2}D^\circ + {}^{2}P^\circ$ ($4 + 10 + 6 = 20$, odd parity)
   - $d^2$ ($\binom{10}{2} = 45$): $^{3}F + {}^{1}D + {}^{3}P + {}^{1}G + {}^{1}S$
   - $d^3$ ($\binom{10}{3} = 120$): $^{4}F + {}^{4}P + {}^{2}H + {}^{2}G + {}^{2}F + 2\,{}^{2}D + {}^{2}P$ (correctly detects multiplicity `count = 2` for $^{2}D$)
   - $d^5$ ($\binom{10}{5} = 252$): includes ground $^{6}S$ ($2S+1=6$).
2. **Particle–Hole Equivalence:** Closed shells ($\ell^{4\ell+2}$) yield exclusively $^{1}S$, and complementary occupancies $\ell^{q}$ and $\ell^{4\ell+2-q}$ produce identical $(L, S)$ term sets (`p^4 ≡ p^2`, `d^8 ≡ d^2`).
3. **Seniority Numbers ($v$):** For repeated $d^q$ terms (notably $d^3 \, {}^{2}D$ with $v=1$ vs $v=3$ and $d^5$ repeated $^{2}D, {}^{2}F, {}^{2}G$), `seniorities` tracks the exact lowest occupancy $v \le q$ at which each $(L, S)$ first arises along the $d^v \to d^{v+2}$ chain, matching Racah's classification.

---

## 3. Multi-Shell Clebsch–Gordan Coupling & Configuration Parser

Given non-equivalent open subshells, `enumerateLSTerms(subshells)` iteratively couples $(L_1, S_1) \otimes (L_2, S_2) \to \bigoplus |L_1 - L_2| \le L \le L_1 + L_2,\; |S_1 - S_2| \le S \le S_1 + S_2$, retaining **intermediate coupling parentages** (e.g., `[2p²(³P) 3d¹] ²D`) and total degeneracy count:
$$\sum_{\text{all coupled terms}} \text{count} \cdot (2L+1)(2S+1) = \prod_{i} \binom{4\ell_i+2}{q_i}$$
Verified in `lsTermCi.test.ts` on `2p¹ 3p¹` (`36` microstates, 6 terms) and `2p² 3d¹` (`150` microstates, `even` parity since $\sum q_i \ell_i = 2\cdot 1 + 1\cdot 2 = 4$).

`parseConfigurationString(text)` supports compact noble-gas core shorthands (`[He]`, `[Ne]`, `[Ar]`) and caret/space formats (`"[Ne] 3s^2 3p^2"` or `"1s2 2s2 2p2"`), rejecting invalid shell capacities ($q > 2(2\ell+1)$) or unphysical quantum numbers ($n \le \ell$).

---

## 4. Unsplit Fine-Structure $J$ Ranges (No Spin–Orbit Diagonalization)

Each enumerated term lists `allowedJ = [|L-S|, ..., L+S]` strictly as a **group-theoretic Russell–Saunders angular momentum multiplicity tag**. Relativistic Breit–Pauli spin–orbit, spin–other-orbit, and $J$-level splittings are **not** computed in `v0.7.1`; all eigenvalues inside a $^{2S+1}L^\pi$ multiplet remain $J$-degenerate.
