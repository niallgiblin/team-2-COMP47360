#!/bin/bash
# Manual SHA-256 verification for runtime ML binaries.
# Read-only: does not download, modify, delete, or untrack artifacts.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

hash_cmd() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    echo "ERROR: need shasum or sha256sum" >&2
    exit 1
  fi
}

echo "Verifying runtime artifact checksums..."
echo "======================================"

failures=0
checked=0

verify_file() {
  local expected="$1"
  local relpath="$2"
  local file="$ROOT/$relpath"

  if [ ! -f "$file" ]; then
    echo "FAIL  missing: $relpath"
    failures=$((failures + 1))
    return
  fi

  local actual
  actual="$(hash_cmd "$file")"
  checked=$((checked + 1))

  if [ "$actual" = "$expected" ]; then
    echo "PASS  $relpath"
  else
    echo "FAIL  checksum mismatch: $relpath"
    echo "      expected: $expected"
    echo "      actual:   $actual"
    failures=$((failures + 1))
  fi
}

verify_file "5e7cd5bfb2a90667d84eaf1fb66b5380d3e86b52f41f5cb7c21cfc858f0a2a52" "BackEnd/busyness-service/models/DNNs/100 NET.keras"
verify_file "e632ce9dae7b494b0be3a12fbabe1eec265e5ca65f36e1c48c6ad4d1558e01d4" "BackEnd/busyness-service/models/DNNs/105 NET.keras"
verify_file "5e0aab6c83880d9ac068cd4c07c6764646c161b11c8fd843073bc4b99569677b" "BackEnd/busyness-service/models/DNNs/107 NET.keras"
verify_file "073d1f3260327795a0c3c03b276f01645839aa60cf67bb0da605f14bc84b2c70" "BackEnd/busyness-service/models/DNNs/113 NET.keras"
verify_file "7c91365a7372c1ce1446139ede8afc7c85e7a305fcdfb640e8d8e8396cfcb04b" "BackEnd/busyness-service/models/DNNs/114 NET.keras"
verify_file "2b3b784234073652a0ec7248b4b9ab3f69a5e15f85a972d1913c59fba1eddfd7" "BackEnd/busyness-service/models/DNNs/116 NET.keras"
verify_file "5613ccaf4cfbac1e233b072b8c7118a4780556b8b2144f560d9a746f988da796" "BackEnd/busyness-service/models/DNNs/12 NET.keras"
verify_file "e8aa9208dc40197d1464b67cf02f82a184183f4388bf1608b93be88efc841dd7" "BackEnd/busyness-service/models/DNNs/120 NET.keras"
verify_file "5a11c55099308f02c21a9186edbfaa3c6e31d86c21fc6a4f252a8e7e4f4d74a5" "BackEnd/busyness-service/models/DNNs/125 NET.keras"
verify_file "b7958e307bb5e3d6e3c78885eb0daf3d867ef5cfc849eeb59b0759b95c48ad87" "BackEnd/busyness-service/models/DNNs/127 NET.keras"
verify_file "4621e0119180b2c34705e334397f5228e29d37921bb918a07cec7f292be0f92b" "BackEnd/busyness-service/models/DNNs/128 NET.keras"
verify_file "19ff3757b425773d530a4ebde9573c80ea79c91666e5be625d8807fbd49b99c3" "BackEnd/busyness-service/models/DNNs/13 NET.keras"
verify_file "117cbf7cba2322915e34db65c66815a05156823b972019f9599cb4fb917e4d5e" "BackEnd/busyness-service/models/DNNs/137 NET.keras"
verify_file "3dad2598119b9feade79f79510f4715d71d2edd9dec214086f7df2727a0b3e64" "BackEnd/busyness-service/models/DNNs/140 NET.keras"
verify_file "bdc8a978be576c6147692858c00f4908be871115c8b040117782656c45ae5bb9" "BackEnd/busyness-service/models/DNNs/141 NET.keras"
verify_file "9334d84e6f1ca0fba8bd0822f8161a234e8134a5a362282287bd773635261576" "BackEnd/busyness-service/models/DNNs/142 NET.keras"
verify_file "f9aa52efd7b3b40225aab54f637c9d3e367ab773debc648251e9c6ececcc633a" "BackEnd/busyness-service/models/DNNs/143 NET.keras"
verify_file "680284a8bff7c9a164ccb4de5cd9c583d9dbea59f86b9c5387bbc4a2e510cbde" "BackEnd/busyness-service/models/DNNs/144 NET.keras"
verify_file "139fed1e88e5ca5c8aa21fab91d1443d40c4c1a7b610ecc08ac2bc9bd267e2ee" "BackEnd/busyness-service/models/DNNs/148 NET.keras"
verify_file "6ec98ad3a838ddd2269f14f9b5ceabb1edc2b11efdb08a42b96d7a4079f37be8" "BackEnd/busyness-service/models/DNNs/151 NET.keras"
verify_file "488b90a120ad9b5d35a67d31034ea36e9f332cb2716609341f887d776bae3eb1" "BackEnd/busyness-service/models/DNNs/152 NET.keras"
verify_file "566952febc4fa82056cfa90e89210d9aa855a744d59c8ff47b847a0b74310668" "BackEnd/busyness-service/models/DNNs/153 NET.keras"
verify_file "2a2a896dc90970275e0ee2ff68d389056dfcd1b2a04fddb4574230f1b60c320f" "BackEnd/busyness-service/models/DNNs/158 NET.keras"
verify_file "93b2e7f62c33c917fc23335ade2722afe31b4c4f9fb2be981d6692921abef2d7" "BackEnd/busyness-service/models/DNNs/161 NET.keras"
verify_file "9f98124d981d643b89eb9da94fff2f3c8f460d84e687a1fcb9af7889a2503ced" "BackEnd/busyness-service/models/DNNs/162 NET.keras"
verify_file "66698f3852e961e7597263d13729b67c20c7d5eeeac65bffce13b37f738e463c" "BackEnd/busyness-service/models/DNNs/163 NET.keras"
verify_file "0fbafe7d29417d9aa572e7c58e74abc5e28fa461284421980a8935b374ef87ad" "BackEnd/busyness-service/models/DNNs/164 NET.keras"
verify_file "798490ea0effc82799a3c2e58e1ac1802ca0e35fdbc2b9cb10524a8173df7d3b" "BackEnd/busyness-service/models/DNNs/166 NET.keras"
verify_file "5dbb698d271e2ea939e5e300d5ef15f6344ab16e259cfaed2b26be2eee7be435" "BackEnd/busyness-service/models/DNNs/170 NET.keras"
verify_file "f423fb57f3175f608a9133702e55226ea3d2fea62507d0aaa4ea5c91dfb18d8b" "BackEnd/busyness-service/models/DNNs/186 NET.keras"
verify_file "357455cee40b64458a514ae16ddf23b27351541deedf80fac7d34a068e35d5a5" "BackEnd/busyness-service/models/DNNs/194 NET.keras"
verify_file "839b909ccce098bd04ecad452375b8b41091b27b13ff42a36ee0558826ca5234" "BackEnd/busyness-service/models/DNNs/202 NET.keras"
verify_file "845882ef6e487359a2263bfce32351e37d6835ceb25ba62a27d0dc66d8f19aaa" "BackEnd/busyness-service/models/DNNs/209 NET.keras"
verify_file "0c2c9ed0ecf91574e709c61ff66f66c00dc3656fa6028928d2eeea0691bebafb" "BackEnd/busyness-service/models/DNNs/211 NET.keras"
verify_file "db914f0e95bcf4fff7fcc98bbf383495cf84766b66aab0f42e81e1a7cbf8c0bd" "BackEnd/busyness-service/models/DNNs/224 NET.keras"
verify_file "f581466c9b5eb8a61b2fe277342710bc15402c346533c01e47222b0718ec29e3" "BackEnd/busyness-service/models/DNNs/229 NET.keras"
verify_file "f4e91705e68250f6c061019f2f029982fbcd01c33b68ed8e5dbc61d3f920d4b5" "BackEnd/busyness-service/models/DNNs/230 NET.keras"
verify_file "b7f1914db369a9a36aae2e5e3c6d0ec72a743b3e83b3b2d9c56a86d31e0cdd3e" "BackEnd/busyness-service/models/DNNs/231 NET.keras"
verify_file "7c053156e5ee3a4c9631d88f082144ba49d5cf773ee168654a77b12ec8a55314" "BackEnd/busyness-service/models/DNNs/232 NET.keras"
verify_file "685dde0739fd6584329781fd5616679b59f7e2f9e802a9feaad4dc6665c2f1b1" "BackEnd/busyness-service/models/DNNs/233 NET.keras"
verify_file "ae17bdcc8ad9057056a71d18009bea236c7c9a77df4aca319cd80688f009069b" "BackEnd/busyness-service/models/DNNs/234 NET.keras"
verify_file "a4c4b57f4fc65f5dc9185df7250f806b82e94afb9731d0c609348a47f06ebaa5" "BackEnd/busyness-service/models/DNNs/236 NET.keras"
verify_file "9ae874fd262cce48c16d3f7df749eb2e915603aeb27933cbae473fdd53ad3050" "BackEnd/busyness-service/models/DNNs/237 NET.keras"
verify_file "33f0f7d78ea83a0715b5f980568eabb40b8aabf6520283e753edb2ab178cd7c4" "BackEnd/busyness-service/models/DNNs/238 NET.keras"
verify_file "1bf15ab97954b6ca5acc08eba320cb478e614cfe6dc83ed12bebe9b5a08cd49c" "BackEnd/busyness-service/models/DNNs/239 NET.keras"
verify_file "967ae2303dbbb0eafa4d391b35b102609a40fbeb70963d6aa8b764a696499afb" "BackEnd/busyness-service/models/DNNs/24 NET.keras"
verify_file "1103f525a09d6d1f82282c1d6bd03c7fc895ba6411aca8940d25990353f78d2c" "BackEnd/busyness-service/models/DNNs/243 NET.keras"
verify_file "5cb42363b16bb9f3b1cd3706fb4f1d0755808633f23dea75927acf65b9f1c838" "BackEnd/busyness-service/models/DNNs/244 NET.keras"
verify_file "a16366de78dff2e5e90f5351d955179b027601033da4dd74725e92b30b39fd03" "BackEnd/busyness-service/models/DNNs/246 NET.keras"
verify_file "f92533215fbeddd1de02258ed1bb965561b7933de95bf33676093c3aa84e9a01" "BackEnd/busyness-service/models/DNNs/249 NET.keras"
verify_file "fd0af30c58f6484fcae1fd20a3a94dcc10cfc633893c498af6455d66fc681e4f" "BackEnd/busyness-service/models/DNNs/261 NET.keras"
verify_file "de911bce9425c96ad73bb1367f33833e0a9ca296710d2e9d9d29ab16d69c81f9" "BackEnd/busyness-service/models/DNNs/262 NET.keras"
verify_file "442e19f91b1c401393b9d931712fe4a6df5bbf13f4878a6ec8314b7ebb631ca2" "BackEnd/busyness-service/models/DNNs/263 NET.keras"
verify_file "969dd1814589251181e1db9a2a891cbc1a84dc3b6d85aaf230ec3db52319a54e" "BackEnd/busyness-service/models/DNNs/4 NET.keras"
verify_file "484015c8d4b7e00791e8ee1acb05b7510c031de1dc0e64117895e196a1b5184b" "BackEnd/busyness-service/models/DNNs/41 NET.keras"
verify_file "0632d604f2468f79ed1da0c063b608aeb6cb4841cc78cf6b1d2efedf29b0d45f" "BackEnd/busyness-service/models/DNNs/42 NET.keras"
verify_file "3618cf7690ef5462c649571cfbd90d2648b4fb9bd078ffc0508f1ea820a3b106" "BackEnd/busyness-service/models/DNNs/43 NET.keras"
verify_file "39e3410a94164fdfc87a92e955bfdb6c42fa6e0de02a9f33eacd2b1c535ba27d" "BackEnd/busyness-service/models/DNNs/45 NET.keras"
verify_file "f6324ebad736af1245c7ca1c9012e432c95df34392260655bc166d6748fef4e0" "BackEnd/busyness-service/models/DNNs/48 NET.keras"
verify_file "6d5bf6033b8835986f6a3d19273a48ea0a522a55a62f4dc34b684a05b86c379c" "BackEnd/busyness-service/models/DNNs/50 NET.keras"
verify_file "51971a85f38362baacf96306d67805e8b48bf3744ac2bee09fa7c5197e16131b" "BackEnd/busyness-service/models/DNNs/68 NET.keras"
verify_file "615dd9070c7605b979d834f4a358a3ca014cc715fd8e454405ac084ec11b4e89" "BackEnd/busyness-service/models/DNNs/74 NET.keras"
verify_file "4236432087bd51a7d485dee819690d73ef1396321bd73c4d477d68a9fde9b2c8" "BackEnd/busyness-service/models/DNNs/75 NET.keras"
verify_file "63bdfca7c9dee5a1c1cf1b137abbe550dbfa6a1896b7cf4769a2e48dae9b9655" "BackEnd/busyness-service/models/DNNs/79 NET.keras"
verify_file "3057c08bcce1788f923e8fa45c27f4298263f6c11e578d7641b9553097390c6d" "BackEnd/busyness-service/models/DNNs/87 NET.keras"
verify_file "5f99c24cb1d2964ef2ec1b13d44be04e122528d0b064a5b6f48a0ca9d40d3aa7" "BackEnd/busyness-service/models/DNNs/88 NET.keras"
verify_file "8671bca905c7edf11c211c6a8e590a258042e104d078118db029e45bd4bf147f" "BackEnd/busyness-service/models/DNNs/90 NET.keras"
verify_file "d3edc9b7b0300ad6a52f269c94433415afaf90ea892831ede18ad2755171e9cb" "BackEnd/busyness-service/models/LSTMs/Fin.keras"
verify_file "e668b3c74ad55cac2a0991bf81b10d3023261b464080f4c42f4b5a9558ba06af" "BackEnd/llm-service/data/location_embeddings.npy"
verify_file "0b3c8c717335c801abb15983036a6f1df4b6943fd6b93717969efd96d22eeec6" "BackEnd/llm-service/models/sentence-transformers/model.safetensors"

echo ""
echo "Checked $checked file(s); failures: $failures"

if [ "$failures" -gt 0 ]; then
  exit 1
fi

echo "All runtime binary checksums verified."
