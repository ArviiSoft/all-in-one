const ENTRIES_COLLECTION = "arvis_database_entries";
const METADATA_COLLECTION = "arvis_database_meta";

const entryValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "path", "content", "generation", "createdAt", "updatedAt"],
    additionalProperties: false,
    properties: {
      _id: { bsonType: "string", minLength: 1 },
      path: { bsonType: "string", minLength: 1 },
      content: { bsonType: "string" },
      generation: { bsonType: "string", minLength: 1 },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
};

const metadataValidator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["_id", "generation", "previousGeneration", "createdAt", "updatedAt"],
    additionalProperties: false,
    properties: {
      _id: { enum: ["active"] },
      generation: { bsonType: "string", minLength: 1 },
      previousGeneration: { bsonType: ["string", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
};

module.exports = {
  ENTRIES_COLLECTION,
  METADATA_COLLECTION,
  entryValidator,
  metadataValidator,
};
