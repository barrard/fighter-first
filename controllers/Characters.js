import CHARACTERS, { getCharacterById } from "../../shared/Characters.js";

export default {
    verifyCharacter: (id) => getCharacterById(id),
    getAll: () => CHARACTERS,
};
