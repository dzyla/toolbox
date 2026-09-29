#!/usr/bin/env python3
"""Regenerate src/data/restriction-enzymes.json from Biopython's REBASE snapshot.

Usage: python3 scripts/data/build-restriction-enzymes.py

Keeps every commercially available enzyme with a single defined cut on each strand.
Enzymes that cut twice (both sides of the site, e.g. BaeI, BcgI) are skipped because
the digest model represents one cut per site.
"""
import json
from pathlib import Path

import Bio
from Bio.Restriction import CommOnly
from Bio.Restriction.Restriction_Dictionary import suppliers

OUT = Path(__file__).resolve().parents[2] / 'src' / 'data' / 'restriction-enzymes.json'


def entry(enzyme):
    size = enzyme.size
    # fst5: top-strand cut from the site start; fst3: bottom-strand cut from the site end.
    top = enzyme.fst5
    bottom = size + enzyme.fst3
    record = {
        'name': str(enzyme),
        'site': enzyme.site,
        'cut': [top, bottom],
        'suppliers': ''.join(sorted(enzyme.suppl)),
    }
    if enzyme.opt_temp:
        record['optTempC'] = enzyme.opt_temp
    if enzyme.inact_temp:
        record['inactTempC'] = enzyme.inact_temp
    return record


def main():
    enzymes = sorted(
        (e for e in CommOnly if e.scd5 is None and e.fst5 is not None and e.fst3 is not None),
        key=lambda e: str(e).lower(),
    )
    data = {
        '_source': (
            'REBASE, Roberts RJ, Vincze T, Posfai J, Macelis D (2023) Nucleic Acids Res 51:D629, '
            f'http://rebase.neb.com ; commercially available enzymes extracted from Bio.Restriction '
            f'(Biopython {Bio.__version__}) by scripts/data/build-restriction-enzymes.py'
        ),
        '_note': (
            "site: recognition sequence on the top strand 5'->3' (IUPAC). cut: [top, bottom] = number of "
            'nucleotides from the site start to the cut on the top strand and (in top-strand coordinates) on '
            "the bottom strand. bottom-top > 0: 5' overhang; < 0: 3' overhang; 0: blunt. Type IIS enzymes cut "
            'outside the site. suppliers: REBASE supplier codes (see _suppliers). optTempC / inactTempC: '
            'REBASE incubation and heat-inactivation temperatures when recorded. Enzymes cutting on both '
            'sides of their site are omitted.'
        ),
        '_suppliers': {code: name for code, (name, _) in sorted(suppliers.items())},
        'enzymes': [entry(e) for e in enzymes],
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False) + '\n')
    print(f'wrote {len(data["enzymes"])} enzymes to {OUT}')


if __name__ == '__main__':
    main()
