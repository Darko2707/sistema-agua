// Modelo de evidencia de fotos
// ====================

const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class PhotoEvidence extends Model {
  static initModel() {
    PhotoEvidence.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      activityId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Activities',
          key: 'id'
        }
      },
      workerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'Workers',
          key: 'id'
        }
      },
      circuit: {
        type: DataTypes.STRING,
        allowNull: false
      },
      subdivision: {
        type: DataTypes.STRING,
        allowNull: false
      },
      filename: {
        type: DataTypes.STRING,
        allowNull: false
      },
      uploadDate: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      },
      fileUrl: {
        type: DataTypes.STRING,
        allowNull: false
      }
    }, {
      sequelize,
      modelName: 'PhotoEvidence'
    });
  }
}

PhotoEvidence.initModel();
module.exports = PhotoEvidence;
// Modelo de evidencia de fotos
const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

class PhotoEvidence extends Model {
  static initModel() {
    PhotoEvidence.init(
      {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        activityId: { type: DataTypes.INTEGER, allowNull: false },
        workerId: { type: DataTypes.INTEGER, allowNull: false },
        filename: { type: DataTypes.STRING, allowNull: false },
        uploadDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        subdivision: { type: DataTypes.STRING, allowNull: false }
      },
      {
        sequelize,
        modelName: 'PhotoEvidence'
      }
    );
  }
}

module.exports = PhotoEvidence;