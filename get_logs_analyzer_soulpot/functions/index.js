// The Cloud Functions for Firebase SDK to create Cloud Functions and set up triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access Firestore.
const admin = require('firebase-admin');
var serviceAccount = require("./soulpot-5fbe6-firebase-adminsdk-9zrre-34464ab414.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

exports.onAnalyzerValueChange = functions.region("europe-west1").firestore
    .document('analyzers/{analyzerID}')
    .onUpdate((change, context) => {
        const oldValue = change.before.data();
        const newValue = change.after.data();

        if (newValue.userID !== undefined) {

            admin.firestore().collection("plants").doc(newValue.plantID).get().then(plant => {
                const temperatureRecommendations = [plant.data()["min_temp"], plant.data()["max_temp"]];
                const humidityRecommendations = [plant.data()["min_soil_moist"], plant.data()["max_soil_moist"]];
                const luminosityRecommendations = [plant.data()["min_light_lux"], plant.data()["max_light_lux"]];

                // CHECK TEMPERATURE RECOMMENDATIONS

                if (newValue.temperature < temperatureRecommendations[0] && oldValue.temperature > temperatureRecommendations[0]) {
                    console.log("lowTemperature function: temperature is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "La température de " + newValue.name + " est trop basse !",
                            body: "La temperature de " + newValue.name + " est à " + newValue.temperature + "°C, alors que la température minimum recommandée est " + temperatureRecommendations[0] + "°C"
                        }
                    });
                } else if (newValue.temperature > temperatureRecommendations[1] && oldValue.temperature < temperatureRecommendations[1]) {
                    console.log("lowTemperature function: temperature is too high for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "La température de " + newValue.name + " est trop haute !",
                            body: "La temperature de " + newValue.name + " est à " + newValue.temperature + "°C, alors que la température maximum recommandée est " + temperatureRecommendations[1] + "°C"
                        }
                    });
                }

                // CHECK HUMIDITY RECOMMENDATIONS

                if (newValue.humidity < humidityRecommendations[0] && oldValue.humidity > humidityRecommendations[0]) {
                    console.log("lowHumidity function: humidity is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "L'hygrométrie de " + newValue.name + " est trop basse !",
                            body: "L'hygrométrie de " + newValue.name + " est à " + newValue.humidity + "%, alors que l'hygrométrie minimale recommandée est de " + humidityRecommendations[0] + "%\nOuvrez l'application pour arroser votre plante à distance"
                        }
                    });
                } else if (newValue.humidity > humidityRecommendations[1] && oldValue.humidity < humidityRecommendations[1]) {
                    console.log("lowHumidity function: humidity is too high for " + context.params.analyzerID);
                }

                // CHECK LUMINOSITY RECOMMENDATIONS

                if (newValue.luminosity < luminosityRecommendations[0] && oldValue.luminosity > luminosityRecommendations[0]) {
                    console.log("lowLuminosity function: luminosity is too low for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "Votre plante " + newValue.name + " ne reçoit pas assez de lumière !",
                            body: "La luminosité reçue par " + newValue.name + " est de " + newValue.luminosity + " lux, alors que la luminosité minimale recommandée est de " + luminosityRecommendations[0] + " lux"
                        }
                    });
                } else if (newValue.luminosity > luminosityRecommendations[1] && oldValue.luminosity < luminosityRecommendations[1]) {
                    console.log("lowLuminosity function: luminosity is too high for " + context.params.analyzerID);
                    admin.messaging().sendToTopic(newValue.userID, {
                        notification: {
                            title: "Votre plante " + newValue.name + " reçoit trop de lumière !",
                            body: "La luminosité reçue par " + newValue.name + " est de " + newValue.luminosity + " lux, alors que la luminosité maximale recommandée est de " + luminosityRecommendations[1] + " lux"
                        }
                    });
                }

                // UPDATE OBJECTIVES

                admin.firestore().collection('objectives').get().then(snapshot => {
                    snapshot.forEach(doc => {
                        let objectiveData = doc.data();

                        if (objectiveData['field'] !== undefined) {
                            let valueToCheck, recommendations;

                            //Get recommandations
                            if (objectiveData['field'].localeCompare("humidity") === 0) {
                                valueToCheck = newValue.humidity;
                                recommendations = humidityRecommendations;
                            } else if (objectiveData['field'].localeCompare("luminosity") === 0) {
                                valueToCheck = newValue.luminosity;
                                recommendations = luminosityRecommendations;
                            } else if (objectiveData['field'].localeCompare("temperature") === 0) {
                                valueToCheck = newValue.temperature;
                                recommendations = temperatureRecommendations;
                            }

                            //Get in progress Objectives
                            admin.firestore().doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).get().then(obj => {
                                if (recommendations[0] <= valueToCheck && valueToCheck <= recommendations[1]) {
                                    let today = new Date()

                                    if (obj.data() !== undefined) {
                                        objUserData = obj.data();
                                        if (objUserData['owned'] !== true) {
                                            let beginDate = objUserData['beginDate'] !== undefined ? objUserData['beginDate'].toDate() : new Date();
                                            duration = today - beginDate;

                                            let durationInDays = Math.floor(duration / 1000 / (3600 * 24)) + 1;
                                            let progress = 100/objectiveData['objective_value'] * durationInDays;

                                            if (durationInDays >= objectiveData['objective_value']) {
                                                db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                                    status: progress,
                                                    owned: true,
                                                    beginDate: beginDate
                                                })
                                            } else {
                                                db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                                    status: progress,
                                                    owned: false,
                                                    beginDate: beginDate
                                                })
                                            }
                                        }
                                    } else {
                                        db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({
                                            status: 1,
                                            owned: false,
                                            beginDate: today
                                        })
                                    }
                                } else {
                                    if (obj.data() !== undefined && obj.data()[owned] !== true) {
                                        db.doc('users/' + newValue.userID + '/objectives_owned/' + doc.id).set({status: 0, owned: false})
                                    }
                                }
                            })
                        }
                    });
                })
            });
        }
        return null;
    });