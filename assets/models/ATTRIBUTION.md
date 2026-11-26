# Modello anatomico

`corpo.bin` è ricavato da **BodyParts3D**, © The Database Center for Life Science, distribuito con licenza
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

- Fonte: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/ (versione 4.0, albero part-of, OBJ 99%).
- Licenza: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html
- Citazione: Mitsuhashi N. et al., *BodyParts3D: 3D structure database for anatomical concepts*, Nucleic Acids Res. 2009;37:D782–5, doi:10.1093/nar/gkn613.

**Modifiche:**
- sono state selezionate la pelle, lo scheletro e 12 gruppi di strutture (le zone della mappa);
- gli assi sono stati convertiti (Z-su → Y-su);
- le mesh sono state semplificate con meshoptimizer, da circa 1,7 milioni a circa 100.000 triangoli;
- le coordinate sono state quantizzate a 16 bit in un formato binario proprio.

Lo script è in `tools/build-corpo.mjs`.
