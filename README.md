<p align="center">
  <a href="https://veracitea.github.io/PAWS/">
    <img src="https://raw.githubusercontent.com/Veracitea/PAWS/main/assets/images/paws-wordmark.png" alt="PAWS logo" width="380" />
  </a>
</p>

<h1 align="center">Policy-driven Agentic World Simulation</h1>

<p align="center">
  A temporally grounded research dataset connecting policy interventions, news evidence, stakeholder actions, and market context.
</p>

<p align="center">
  <a href="https://veracitea.github.io/PAWS/">Project website</a> ·
  <a href="https://veracitea.github.io/PAWS/PAWS.pdf">Paper</a> ·
  <a href="https://veracitea.github.io/PAWS/#playground">Interactive explorer</a> ·
  <a href="https://veracitea.github.io/PAWS/data/public-dataset.json">Public dataset</a> ·
  <a href="https://veracitea.github.io/PAWS/information.html">Project information</a>
</p>

## Overview

**PAWS** organizes historical financial and economic policy episodes into linked evidence: what policy changed, which actors responded, what they did, when they acted, and what the surrounding market looked like. Its core research unit is **policy–actor–action–day**, with source links and row-level provenance supporting inspection and replay.

The project supports research into policy-conditioned multi-agent behavior, stakeholder responses, action timing, and historical world simulation.

**Release status:** preprint preview. This repository contains the static project website, paper, research figures, a sanitized public dataset subset, and export utilities. The full SQLite database and a runnable end-to-end simulation system are not included in this release.

## Explore PAWS

- **Follow a policy episode:** compare dated news and actions on a policy-normalized timeline, using documented policy windows or robust observed evidence windows.
- **Inspect the evidence:** search published `Policies`, `News`, `Action`, and `ActionFrame` views; follow source URLs and the links between news and action rows.
- **Examine stakeholder behavior:** browse entity summaries, action types, and structured event-frame fields.
- **Trace provenance:** inspect source table names, row IDs, policy links, news links, and the published JSON behind a record.
- **Read the research:** view policy timelines, stakeholder coverage, event-frame distributions, and other figures alongside the paper.

Start with the [interactive explorer](https://veracitea.github.io/PAWS/#playground), or download the [public JSON subset](https://veracitea.github.io/PAWS/data/public-dataset.json).

## Dataset at a glance

The full database snapshot reported on the project website and the subset shipped in this repository have different scopes:

| Component | Full database | Subset |
| --- | ---: | ---: |
| Verified policy episodes | 36 | 5 |
| Policy-linked news rows | 12,727 | 579 |
| Structured action rows | 65,291 | 1,190 |
| Corresponding action-frame rows | 65,291 | 1,190 |

The full snapshot also reports **301 policy query keys**. The public subset provides **36 derived entity summaries** and covers the short-selling ban, TALF, CPFF, TAF, and decimalization. Policy names shown as “catalogue only” in the explorer do not imply that their evidence rows are included in the download.

The JSON contains `meta`, `schema`, `policies`, `news`, `actions`, and `entities`. Each published action embeds its structured frame under `frame`; `ActionFrame` is an explorer view over those joined fields, not a separate top-level JSON array.

The public export omits article bodies, raw event-frame payloads, classification rationales, and evidence spans. It retains IDs and linkage fields so that published records can be traced to their source rows. The source SQLite database is not distributed here.

For access to the full dataset, contact **Tiviatis Sim** at [tiviatis@u.nus.edu](mailto:tiviatis@u.nus.edu).

## Data construction

1. **Select and review policies:** verify episode dates, scope, relevance, and supporting documentation.
2. **Collect dated context:** retrieve policy-window news and align contemporaneous market data.
3. **Extract stakeholder actions:** identify actors, actions, dates, source links, and event-frame fields.
4. **Normalize and coalesce:** resolve entity aliases and merge related daily actions while retaining provenance.
5. **Validate and release:** combine assisted checks and human review to prepare policy–agent–day records for research.

See the [paper](https://veracitea.github.io/PAWS/PAWS.pdf) and [dataset lifecycle notes](https://veracitea.github.io/PAWS/information.html#lifecycle-title) for details.

## Run the website locally

The website uses plain HTML, CSS, and JavaScript. No package installation or build step is required.

```sh
git clone https://github.com/Veracitea/PAWS.git
cd PAWS
python -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). On Windows, `py -m http.server 8000 --bind 127.0.0.1` is an alternative if Python is installed through the Python launcher.

Serve the directory over HTTP: the explorer loads JSON with `fetch()`, which may fail when opening `index.html` directly as a local file.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html`, `script.js`, `styles.css` | Project landing page, dataset explorer, and styling |
| `information.html`, `information.js` | Lifecycle, contributors, licensing, and visitor board |
| `config.js` | Resource links, dataset location, and analytics configuration |
| `data/public-dataset.json` | Sanitized public research subset |
| `data/visitor-stats.json` | Generated public visitor summary |
| `assets/images/`, `logos/` | Project artwork and institutional logos |
| `figures/` | Research figures and supporting tables |
| `PAWS.pdf`, `PAWS-preview.bib` | Paper and provisional citation |
| `scripts/export_public_dataset.py` | Export a public subset from a local PAWS database |
| `scripts/update-visitor-stats.mjs` | Generate aggregate visitor statistics from GoatCounter |
| `.github/workflows/` | GitHub Pages deployment and scheduled analytics updates |

## Export a public subset

This optional step requires access to a compatible PAWS SQLite database and Python 3.10 or later. The exporter uses Python's standard library and opens the database read-only.

```sh
python scripts/export_public_dataset.py --db /path/to/PAWS.db --output data/public-dataset.json --policies 5 6 7 8 10
```

Use `python scripts/export_public_dataset.py --help` for sampling limits and other options. Review the generated file before publication, including its metadata, provenance, and source-rights constraints. Keep the full database outside the public repository.

## Configuration and deployment

Edit `config.js` to update the paper, code, dataset, or arXiv links. The arXiv URL is currently empty and the website displays it as forthcoming.

For GitHub Pages, select **Settings → Pages → Source → GitHub Actions**. The included **Deploy PAWS website** workflow publishes the static repository on pushes to `main` and can also be run manually. It also runs after a successful visitor-summary workflow.

## Citation

Please cite PAWS when using the dataset or research resources. The current entry is provisional; use the final paper citation when it becomes available.

```bibtex
@misc{paws_dataset,
  title  = {PAWS: Policy-driven Agentic World Simulation},
  author = {Sim, Tiviatis and Woon, Jia Hui and Gao, Xinming and Gao, Chen and Zhu, Fengbin and Zheng, Huanhuan and Seng, Chua Tat and Kawaguchi, Kenji},
  note   = {Pre-publication dataset; citation to be updated}
}
```

The entry above follows the repository's [preview citation](https://veracitea.github.io/PAWS/PAWS-preview.bib).

## Team and contact

**Tiviatis Sim, Woon Jia Hui, Xinming Gao, Chen Gao, Fengbin Zhu, Zheng Huanhuan, Chua Tat Seng, and Kenji Kawaguchi.**

Affiliations include the National University of Singapore, Tsinghua University, and City University of Hong Kong. See the [contribution record](https://veracitea.github.io/PAWS/information.html#contributors-title) for roles and affiliations.

For dataset access and research inquiries, email [tiviatis@u.nus.edu](mailto:tiviatis@u.nus.edu). Report website issues through [GitHub Issues](https://github.com/Veracitea/PAWS/issues).

## Licensing and research use

- **Website source:** [MIT License](LICENSE).
- **Dataset:** GNU GPLv3, as stated on the [project information page](https://veracitea.github.io/PAWS/information.html#licensing-title).
- **Third-party sources:** linked news and other source materials retain their respective rights; article bodies are excluded from this public subset.

PAWS is intended for research. Historical coverage is uneven, and assisted extraction and entity resolution may contain residual errors. Temporal alignment provides context but does not establish causal policy effects or provide a live trading signal.

The website structure acknowledges [Nerfies](https://nerfies.github.io/) and [MMDocBench](https://mmdocbench.github.io/).
