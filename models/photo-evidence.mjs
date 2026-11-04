// Modelo Sequelize legado. La aplicación activa usa Drizzle y no importa este módulo.
import { DataTypes, Model } from 'sequelize';
import sequelize from '../config/database.js';

class PhotoEvidence extends Model {
  static initModel() {
    PhotoEvidence.init({
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      activityId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Activities', key: 'id' },
      },
      workerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Workers', key: 'id' },
      },
      circuit: { type: DataTypes.STRING, allowNull: false },
      subdivision: { type: DataTypes.STRING, allowNull: false },
      filename: { type: DataTypes.STRING, allowNull: false },
      uploadDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      fileUrl: { type: DataTypes.STRING, allowNull: false },
    }, {
      sequelize,
      modelName: 'PhotoEvidence',
    });
  }
}

PhotoEvidence.initModel();
export default PhotoEvidence;
