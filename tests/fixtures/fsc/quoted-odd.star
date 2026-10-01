# odd formatting: CRLF-free but with comments, blank lines, quotes, rows split across lines

data_other
_rlnSomething 'a b'

data_fsc   

# comment between header and loop
loop_
_rlnAngstromResolution   #1
_rlnFourierShellCorrelationCorrected #2   # trailing comment
_rlnFourierShellCorrelationMaskedMaps  #3

inf 1.0 1.0
10.0 0.99
0.98
5.0 0.80 0.85
# a comment inside the loop
4.0 0.30 0.35
3.0 0.10 0.12
2.5 0.02 0.03
